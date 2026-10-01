import { describe, expect, it } from 'vitest';
import {
  InMemoryLedgerRepository, RADAR_MAX, RECURRING_ISSUE_MESSAGES, buildHomeSummary, buildRadar, buildRecurringRule, nextDue, overdueOccurrences, payOccurrence,
  validateRecurringInput, type Budget, type RecurringRule, type RecurringInput,
} from '../src';
import { USER, accounts, categories, expense, setup } from './fixtures';
import { sqlRepo } from './nodeSqlite';

const TODAY = '2025-03-15';
const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1', userId: USER, name: 'Internet', type: 'expense', amountMinor: 120_000, currency: 'BDT', accountId: 'cash', categoryId: 'bills', frequency: 'monthly', interval: 1,
  anchorDate: '2025-01-17', endDate: null, isBill: true, active: true, ...over,
});

async function snapshot(opts: { rules?: RecurringRule[]; budgets?: Budget[]; build?: (svc: ReturnType<typeof setup>['svc']) => Promise<void>; buffer?: number } = {}) {
  const { repo, svc } = setup();
  repo.recurringRules = opts.rules ?? [];
  repo.budgets = opts.budgets ?? [];
  await opts.build?.(svc);
  const snap = {
    profile: { userId: USER, country: 'BD', currency: 'BDT' as const, timezone: 'Asia/Dhaka', locale: 'en' as const, confirmationPref: 'always_confirm' as const, highImpactMinor: 1_000_000, safetyBufferMinor: opts.buffer ?? 0,
      retainRawInput: false, defaultAccountId: null, aiProcessing: true, displayName: null, primaryGoals: [], onboardedAt: null },
    accounts: repo.accounts, categories: repo.categories, people: repo.people, transactions: await repo.listTransactions(USER), budgets: repo.budgets, recurringRules: repo.recurringRules, goals: [],
  };
  return { snap, summary: buildHomeSummary(snap, TODAY), svc, repo };
}

describe('recurring rule input', () => {
  const ok: RecurringInput = { name: 'Internet', type: 'expense', amountText: '1,200', accountId: 'cash', categoryId: 'bills', frequency: 'monthly', interval: 1, anchorDate: '2025-04-05', endDate: null, isBill: true };
  it('accepts a good rule and builds it', () => {
    const v = validateRecurringInput(ok, accounts, categories, 'BDT');
    expect(v).toEqual({ issues: [], amountMinor: 120_000 });
    expect(buildRecurringRule(USER, 'new', ok, 120_000, 'BDT')).toMatchObject({ id: 'new', active: true, name: 'Internet', endDate: null });
    expect(buildRecurringRule(USER, 'new', ok, 1, 'BDT', rule({ id: 'keep', active: false }))).toMatchObject({ id: 'keep', active: false });
  });
  it('names each problem', () => {
    const bad = validateRecurringInput({ ...ok, name: ' ', amountText: '0', accountId: null, anchorDate: '2025-02-30', interval: 0, categoryId: 'salary' }, accounts, categories, 'BDT');
    expect(bad.issues).toEqual(expect.arrayContaining(['name_required', 'amount_invalid', 'account_required', 'date_invalid', 'interval_invalid', 'category_not_found']));
    expect(validateRecurringInput({ ...ok, endDate: '2025-03-01' }, accounts, categories, 'BDT').issues).toEqual(['end_before_start']);
    expect(validateRecurringInput({ ...ok, accountId: 'zzz' }, accounts, categories, 'BDT').issues).toEqual(['account_not_found']);
    for (const m of Object.values(RECURRING_ISSUE_MESSAGES)) expect(m.length).toBeGreaterThan(5);
  });
  it('allows an income category only for income rules', () => {
    expect(validateRecurringInput({ ...ok, type: 'income', categoryId: 'salary' }, accounts, categories, 'BDT').issues).toEqual([]);
  });
});

describe('paying an occurrence', () => {
  it('records it against the occurrence, dated today, and the bill stops being due', async () => {
    const r = rule(); // 17th of each month
    const { svc, repo } = await snapshot({ rules: [r] });
    expect(nextDue(r, [], TODAY)).toBe('2025-03-17');
    const tx = await svc.create(USER, payOccurrence(r, '2025-03-17', TODAY));
    expect(tx).toMatchObject({ localDate: TODAY, occurrenceDate: '2025-03-17', recurringRuleId: 'r1', merchantName: 'Internet', amountMinor: 120_000 });
    const txs = await repo.listTransactions(USER);
    expect(nextDue(r, txs, TODAY)).toBe('2025-04-17');
    await expect(svc.create(USER, payOccurrence(r, '2025-03-17', TODAY))).rejects.toThrow(); // the same occurrence cannot be recorded twice
  });
  it('finds unpaid occurrences from the last two weeks only', async () => {
    const { snap } = await snapshot({ rules: [rule({ anchorDate: '2025-01-12' })] }); // due the 12th
    expect(overdueOccurrences(snap.recurringRules, snap.transactions, TODAY).map((o) => o.date)).toEqual(['2025-03-12']);
    expect(overdueOccurrences(snap.recurringRules, snap.transactions, '2025-04-20').map((o) => o.date)).toEqual(['2025-04-12']);
    expect(overdueOccurrences(snap.recurringRules, snap.transactions, '2025-04-30')).toEqual([]); // 18 days ago: too old to be sure it was missed
  });
  it('a paused rule never comes due', () => {
    expect(nextDue(rule({ active: false }), [], TODAY)).toBeNull();
  });
});

describe('Financial Radar', () => {
  it('is quiet when nothing needs attention', async () => {
    const { snap, summary } = await snapshot();
    expect(buildRadar(snap, summary, TODAY)).toEqual([]);
  });
  it('flags an overdue bill as urgent and a bill due soon, with plain wording', async () => {
    const { snap, summary } = await snapshot({ rules: [rule({ id: 'a', name: 'Rent', anchorDate: '2025-01-12' }), rule({ id: 'b', name: 'Internet', anchorDate: '2025-01-17' })] });
    const radar = buildRadar(snap, summary, TODAY);
    expect(radar[0]).toMatchObject({ kind: 'bill_overdue', severity: 'urgent', title: 'Rent was due 3 days ago', target: { screen: 'planning', section: 'Recurring' } });
    expect(radar.find((s) => s.kind === 'bill_due_soon')).toMatchObject({ title: 'Internet is due in 2 days' });
    expect(radar[0]!.detail).toContain('৳1,200');
  });
  it('does not flag a bill once it is paid', async () => {
    const r = rule({ anchorDate: '2025-01-12' });
    const { snap, summary } = await snapshot({ rules: [r], build: async (svc) => { await svc.create(USER, payOccurrence(r, '2025-03-12', '2025-03-13')); } });
    expect(buildRadar(snap, summary, TODAY).filter((s) => s.kind === 'bill_overdue')).toEqual([]);
  });
  it('says when plans exceed what is available', async () => {
    const { snap, summary } = await snapshot({ buffer: 99_999_999 });
    const s = buildRadar(snap, summary, TODAY).find((x) => x.kind === 'cash_short');
    expect(s).toMatchObject({ severity: 'urgent', target: { screen: 'safe_to_spend' }, key: 'cash_short:2025-03' });
  });
  it('reports a budget over and a budget on track to go over, once each', async () => {
    const budgets: Budget[] = [
      { id: 'b1', userId: USER, categoryId: 'shopping', amountMinor: 100_000, currency: 'BDT' },
      { id: 'b2', userId: USER, categoryId: 'transport', amountMinor: 1_000_000, currency: 'BDT' },
    ];
    const { snap, summary } = await snapshot({ budgets, build: async (svc) => {
      await svc.create(USER, expense(150_000, '2025-03-10', { categoryId: 'shopping' }));
      await svc.create(USER, expense(500_000, '2025-03-02', { categoryId: 'transport' }));
      await svc.create(USER, expense(400_000, '2025-03-12', { categoryId: 'transport' }));
    } });
    const radar = buildRadar(snap, summary, TODAY).filter((s) => s.kind.startsWith('budget'));
    expect(radar.map((s) => s.kind)).toEqual(['budget_over', 'budget_at_risk']);
    expect(radar[0]).toMatchObject({ title: 'Shopping is over budget', target: { screen: 'planning', section: 'Budgets' } });
    expect(new Set(radar.map((s) => s.key)).size).toBe(2);
  });
  it('leaves out dismissed signals, but only those exact ones', async () => {
    const { snap, summary } = await snapshot({ rules: [rule({ anchorDate: '2025-01-12' })] });
    const all = buildRadar(snap, summary, TODAY);
    const key = all[0]!.key;
    expect(buildRadar(snap, summary, TODAY, [key]).map((s) => s.key)).not.toContain(key);
    expect(buildRadar(snap, summary, TODAY, ['bill_overdue:r1:2025-02-12']).map((s) => s.key)).toContain(key); // an older month's dismissal does not hide this one
    expect(buildRadar(snap, summary, TODAY, new Set(all.map((s) => s.key)))).toEqual([]);
  });
  it('spots an entry recorded twice and an unusually large expense', async () => {
    const { snap, summary } = await snapshot({ build: async (svc) => {
      for (let i = 0; i < 6; i++) await svc.create(USER, expense(30_000 + i * 1_000, `2025-02-${10 + i}`, { categoryId: 'dining', merchantName: `Cafe${i}` }));
      await svc.create(USER, expense(250_000, '2025-03-14', { categoryId: 'dining', merchantName: 'Fancy' }));
      await svc.create(USER, expense(25_000, '2025-03-15', { categoryId: 'groceries', merchantName: 'Shwapno' }));
      await svc.create(USER, expense(25_000, '2025-03-15', { categoryId: 'groceries', merchantName: 'Shwapno' }));
    } });
    const radar = buildRadar(snap, summary, TODAY);
    expect(radar.find((s) => s.kind === 'possible_duplicate')).toMatchObject({ severity: 'info', target: { screen: 'transaction' } });
    expect(radar.filter((s) => s.kind === 'possible_duplicate')).toHaveLength(1); // one signal for the pair, not two
    expect(radar.find((s) => s.kind === 'large_expense')?.title).toBe('Fancy was a large one');
  });
  it('is capped and puts the most urgent first', async () => {
    const rules = Array.from({ length: 9 }, (_, i) => rule({ id: `r${i}`, name: `Bill ${i}`, anchorDate: `2025-01-${String(5 + i).padStart(2, '0')}` }));
    const { snap, summary } = await snapshot({ rules });
    const radar = buildRadar(snap, summary, TODAY);
    expect(radar).toHaveLength(RADAR_MAX);
    expect(radar.every((s) => s.severity === 'urgent')).toBe(true);
  });
});

describe.each([['in-memory', async () => new InMemoryLedgerRepository()], ['sqlite', sqlRepo]] as const)('%s dismissed signals', (_n, make) => {
  it('remembers a dismissal per user and ignores repeats', async () => {
    const repo = await make();
    await repo.dismissSignal(USER, 'k1', '2025-03-15T00:00:00Z');
    await repo.dismissSignal(USER, 'k1', '2025-03-16T00:00:00Z');
    await repo.dismissSignal('other', 'k2', '2025-03-15T00:00:00Z');
    expect(await repo.listDismissedSignals(USER)).toEqual(['k1']);
  });
});
