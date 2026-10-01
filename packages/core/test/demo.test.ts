import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORIES, DEMO_USER_ID, describeTransactions, filterTransactions, liquidBalanceOn, accountBalance, buildDemoData, buildHomeSummary, budgetStatus, floorToWhole, formatMoney, roundToWhole, seedDemoData,
  seedSystemCategories, upcomingObligations, validateTransaction, type LedgerSnapshot,
} from '../src';
import { tx } from './fixtures';
import { sqlRepo } from './nodeSqlite';

const TODAY = '2025-03-15';
const snapshotOf = (today = TODAY): LedgerSnapshot => { const d = buildDemoData(today); return { ...d, categories: DEFAULT_CATEGORIES }; };

describe('default categories', () => {
  it('has unique ids, valid parents, and the spec groups', () => {
    const ids = DEFAULT_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of DEFAULT_CATEGORIES) if (c.parentId) expect(ids).toContain(c.parentId);
    for (const name of ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Entertainment', 'Education', 'Family', 'Finance', 'Travel', 'Other']) expect(DEFAULT_CATEGORIES.some((c) => c.name === name && !c.parentId)).toBe(true);
    expect(DEFAULT_CATEGORIES.find((c) => c.id === 'cat.food.groceries')?.parentId).toBe('cat.food');
  });
});

describe('demo data', () => {
  it('is deterministic and belongs only to the demo user', () => {
    expect(buildDemoData(TODAY)).toEqual(buildDemoData(TODAY));
    const d = buildDemoData(TODAY);
    expect(DEMO_USER_ID).toBe('demo-user');
    expect([...d.accounts, ...d.people, ...d.goals, ...d.budgets, ...d.recurringRules, ...d.transactions].every((x) => x.userId === DEMO_USER_ID)).toBe(true);
  });
  it('contains only valid, non-future transactions that cover every transaction type', () => {
    const d = buildDemoData(TODAY);
    const ledger = { accounts: d.accounts, categories: DEFAULT_CATEGORIES, people: d.people, transactions: d.transactions };
    for (const t of d.transactions) {
      expect(validateTransaction(t, ledger), t.id).toEqual([]);
      expect(t.localDate <= TODAY).toBe(true);
    }
    const types = new Set(d.transactions.map((t) => t.type));
    for (const k of ['expense', 'income', 'transfer', 'refund', 'debt', 'repayment', 'savings_contribution', 'goal_contribution']) expect(types).toContain(k);
    expect(d.transactions.some((t) => t.splits && t.paidBy !== 'me')).toBe(true);
  });
  it('keeps every account at a believable, non-negative balance', () => {
    const d = buildDemoData(TODAY);
    for (const a of d.accounts) expect(accountBalance(a, d.transactions), a.name).toBeGreaterThan(0);
  });
  it('works for any day of the month, not just one date', () => {
    for (const day of ['2025-01-31', '2025-02-28', '2025-03-01', '2025-03-31', '2024-02-29', '2025-12-31']) {
      const d = buildDemoData(day);
      const ledger = { accounts: d.accounts, categories: DEFAULT_CATEGORIES, people: d.people, transactions: d.transactions };
      expect(d.transactions.every((t) => validateTransaction(t, ledger).length === 0), day).toBe(true);
      expect(() => buildHomeSummary({ ...d, categories: DEFAULT_CATEGORIES }, day), day).not.toThrow();
    }
  });
  it('seeds into SQLite once, and a second call changes nothing', async () => {
    const repo = await sqlRepo();
    expect(await seedDemoData(repo, TODAY)).toBe(true);
    expect(await seedDemoData(repo, TODAY)).toBe(false);
    const d = buildDemoData(TODAY);
    expect((await repo.listTransactions(DEMO_USER_ID)).length).toBe(d.transactions.length);
    expect(await repo.listTransactions('real-user')).toEqual([]); // demo data is invisible to any other user
  });
  it('real databases get categories only, never demo records', async () => {
    const repo = await sqlRepo();
    await seedSystemCategories(repo, 'real-user');
    expect((await repo.listCategories('real-user')).length).toBe(DEFAULT_CATEGORIES.length);
    expect(await repo.listAccounts('real-user')).toEqual([]);
    expect(await repo.getProfile(DEMO_USER_ID)).toBeNull();
  });
});

describe('home summary', () => {
  const h = buildHomeSummary(snapshotOf(), TODAY);
  it('reports first-run emptiness for a user with no data', () => {
    const s = buildHomeSummary({ ...snapshotOf(), accounts: [], transactions: [], budgets: [], goals: [], recurringRules: [] }, TODAY);
    expect(s.hasAccounts).toBe(false);
    expect(s.hasTransactions).toBe(false);
    expect(s.recent).toEqual([]);
    expect(s.whatChanged).toEqual({ status: 'insufficient_data', reason: 'no_transactions' });
    expect(s.pulse.vsUsual).toBeNull();
  });
  it('derives the pulse from the ledger with transfers and savings excluded from spending', () => {
    const d = snapshotOf();
    const month = d.transactions.filter((t) => t.localDate >= '2025-03-01');
    const spend = month.filter((t) => t.type === 'expense').reduce((s, t) => s + (t.splits ? t.splits.find((x) => x.personId === 'me')?.amountMinor ?? 0 : t.amountMinor), 0);
    expect(h.pulse.spentMinor).toBe(spend);
    expect(h.pulse.incomeMinor).toBe(9_500_000);
    expect(h.pulse.availableMinor).toBe(h.safeToSpend.liquidMinor);
    expect(h.pulse.savedMinor).toBeGreaterThan(0);
  });
  it('shows an unusual-spending comparison driven by Food, and flags the Food budget', () => {
    expect(h.whatChanged.status).toBe('ok');
    if (h.whatChanged.status !== 'ok') return;
    expect(h.whatChanged.direction).toBe('higher');
    expect(h.whatChanged.drivers[0]!.categoryId).toBe('cat.food');
    expect(h.budgets.find((b) => b.budget.categoryId === 'cat.food')!.state).toBe('over');
  });
  it('lists unpaid bills in the next two weeks and recent activity newest first', () => {
    expect(h.upcoming.map((u) => u.rule.name)).toEqual(['Electricity', 'Streaming']);
    expect(h.upcoming.every((u) => u.date >= TODAY && u.date <= '2025-03-29')).toBe(true);
    const dates = h.recent.map((r) => r.transaction.localDate);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(h.recent).toHaveLength(6);
  });
  it('safe to spend matches its documented formula', () => {
    const s = h.safeToSpend;
    expect(s.availableMinor).toBe(s.liquidMinor - s.upcomingMinor - s.reservedGoalsMinor - s.bufferMinor);
    expect(s.daysRemaining).toBe(17);
  });
});

describe('budget projection and display rounding', () => {
  const b = { id: 'b', userId: 'u1', categoryId: null, amountMinor: 10_000_000, currency: 'BDT' };
  it('does not extrapolate a fixed bill paid early in the month as a daily habit', () => {
    const rent = tx({ type: 'expense', amountMinor: 2_500_000, localDate: '2025-03-05', categoryId: 'cat.bills.rent', recurringRuleId: 'r', occurrenceDate: '2025-03-05' });
    const s = budgetStatus(b, [rent], DEFAULT_CATEGORIES, '2025-03-10');
    expect(s.projectedMinor).toBe(2_500_000);
    expect(s.state).toBe('on_track');
  });
  it('adds unpaid bills still due this month to the projection', () => {
    const rule = { id: 'r2', userId: 'u1', name: 'Net', type: 'expense' as const, amountMinor: 120_000, currency: 'BDT', accountId: 'cash', categoryId: 'cat.bills.internet', frequency: 'monthly' as const, interval: 1, anchorDate: '2025-01-20', endDate: null, isBill: true, active: true };
    const s = budgetStatus(b, [], DEFAULT_CATEGORIES, '2025-03-10', upcomingObligations([rule], [], '2025-03-10', '2025-03-31'));
    expect(s.projectedMinor).toBe(120_000);
  });
  it('still projects everyday spending at its pace', () => {
    const food = tx({ type: 'expense', amountMinor: 400_000, localDate: '2025-03-02', categoryId: 'cat.food.dining' });
    expect(budgetStatus({ ...b, amountMinor: 1_000_000 }, [food], DEFAULT_CATEGORIES, '2025-03-10').projectedMinor).toBe(1_240_000);
  });
  it('floors safe figures and rounds comparisons to whole taka for display', () => {
    expect(floorToWhole(1_245_747, 'BDT')).toBe(1_245_700);
    expect(roundToWhole(866_633, 'BDT')).toBe(866_600);
    expect(roundToWhole(866_650, 'BDT')).toBe(866_700);
    expect(formatMoney(floorToWhole(1_245_747, 'BDT'), 'BDT')).toBe('৳12,457');
  });
});

describe('ledger list and filters', () => {
  const d = snapshotOf();
  const items = describeTransactions(d.transactions, d.accounts, d.categories);
  it('lists every live transaction newest first with names resolved', () => {
    expect(items).toHaveLength(d.transactions.length);
    const dates = items.map((i) => i.transaction.localDate);
    expect([...dates].sort().reverse()).toEqual(dates);
    const transfer = items.find((i) => i.transaction.type === 'transfer')!;
    expect(transfer.accountName).toBeTruthy();
    expect(transfer.toAccountName).toBeTruthy();
    expect(transfer.direction).toBe('neutral');
  });
  it('excludes soft-deleted transactions', () => {
    const gone = { ...d.transactions[0]!, deletedAt: 'x' };
    expect(describeTransactions([gone, ...d.transactions.slice(1)], d.accounts, d.categories)).toHaveLength(d.transactions.length - 1);
  });
  it('filters match the ledger rules and partition the data sensibly', () => {
    const f = (k: Parameters<typeof filterTransactions>[1]) => filterTransactions(items, k).map((i) => i.transaction.type);
    expect(f('income').every((t) => t === 'income')).toBe(true);
    expect(f('expenses').every((t) => t === 'expense' || t === 'refund')).toBe(true);
    expect(f('transfers').every((t) => ['transfer', 'savings_contribution', 'goal_contribution'].includes(t))).toBe(true);
    expect(filterTransactions(items, 'recurring').every((i) => i.transaction.recurringRuleId)).toBe(true);
    expect(filterTransactions(items, 'all')).toHaveLength(items.length);
    expect(f('income').length).toBeGreaterThan(0);
    expect(f('transfers').length).toBeGreaterThan(0);
  });
  it('summarises goals and recurring rules', () => {
    const s = buildHomeSummary(d, TODAY);
    const emergency = s.goals.find((g) => g.goal.id === 'demo-goal-emergency')!;
    expect(emergency.savedMinor).toBe(4_000_000 + 4 * 500_000);
    expect(emergency.ratio).toBeCloseTo(emergency.savedMinor / emergency.goal.targetMinor);
    expect(s.recurring.map((r) => r.rule.name)).toEqual(['Electricity', 'Streaming', 'Rent', 'Internet']); // by next due date
    expect(s.recurring[0]!.nextDate).toBe('2025-03-18');
  });
});

describe('home extras: balance trend and signal', () => {
  const d = snapshotOf();
  it('compares the balance with the same day last month, and only with enough history', () => {
    const s = buildHomeSummary(d, TODAY);
    expect(s.pulse.balanceChange).not.toBeNull();
    const prev = liquidBalanceOn({ accounts: d.accounts, transactions: d.transactions }, '2025-02-15');
    expect(s.pulse.balanceChange!.previousMinor).toBe(prev);
    expect(s.pulse.balanceChange!.ratio).toBeCloseTo((s.pulse.availableMinor - prev) / prev);
    const young = { ...d, transactions: d.transactions.filter((t) => t.localDate >= '2025-03-01') };
    expect(buildHomeSummary(young, TODAY).pulse.balanceChange).toBeNull();
    expect(buildHomeSummary({ ...d, transactions: [] }, TODAY).pulse.balanceChange).toBeNull();
  });
  it('liquid balance on a date ignores later transactions and non-liquid accounts', () => {
    const all = liquidBalanceOn({ accounts: d.accounts, transactions: d.transactions }, '2099-01-01');
    expect(all).toBe(buildHomeSummary(d, TODAY).pulse.availableMinor);
    expect(liquidBalanceOn({ accounts: d.accounts, transactions: d.transactions }, '1999-01-01')).toBe(3 * 0 + 400_000 + 1_500_000 + 800_000); // opening balances of cash, bank, bKash; savings excluded
  });
  it('names the biggest category running well above its usual pace, with the numbers behind it', () => {
    const s = buildHomeSummary(d, TODAY);
    expect(s.signal).not.toBeNull();
    expect(s.signal!.categoryId).toBe('cat.food');
    expect(s.signal!.ratio).toBeGreaterThanOrEqual(0.1);
    expect(s.signal!.deltaMinor).toBe(s.signal!.currentMinor - s.signal!.baselineMinor);
    expect(s.signal!.transactionIds.length).toBeGreaterThan(0);
  });
  it('shows no signal when spending is steady, early in the month, or lower than usual', () => {
    expect(buildHomeSummary(d, '2025-03-05').signal).toBeNull(); // too early in the month
    const calm = { ...d, transactions: d.transactions.filter((t) => t.localDate < '2025-03-01') };
    expect(buildHomeSummary(calm, TODAY).signal).toBeNull();
  });
});
