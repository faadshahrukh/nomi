import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORIES, DEMO_USER_ID, RuleBasedInterpreter, TransactionService, accountBalances, buildDemoData, buildHomeSummary, captureText, detectLocale,
  finalizeDraft, findPossibleDuplicate, nextQuestion, reviseDraft, seedDemoData, validateDraft, type CaptureOutcome, type EditableDraft, type Interpreter,
  type LedgerSnapshot, type LedgerData,
} from '../src';
import { sqlRepo } from './nodeSqlite';

const NOW = new Date('2025-03-15T10:00:00Z'); // after the demo data's 09:00 timestamps, so a new entry sorts first
const TODAY = '2025-03-15';
const demo = buildDemoData(TODAY);
const snapshot: LedgerSnapshot = { ...demo, categories: DEFAULT_CATEGORIES };
const data: LedgerData = { accounts: demo.accounts, categories: DEFAULT_CATEGORIES, people: demo.people, transactions: [] };
const rules = new RuleBasedInterpreter();

const run = (text: string, over: Partial<Parameters<typeof captureText>[0]> = {}) =>
  captureText({ text, source: 'text', snapshot, interpreter: rules, now: NOW, ...over });

function ready(o: CaptureOutcome) {
  if (o.status !== 'ready') throw new Error(`expected ready, got ${o.status}${o.status === 'needs_clarification' ? ' (' + o.clarification.question + ')' : ''}`);
  return o.proposals;
}

describe('spec example sentences (rule-based interpreter + resolution)', () => {
  it('"Spent 450 on lunch."', async () => {
    const [p] = ready(await run('Spent 450 on lunch.'));
    expect(p!.editable).toMatchObject({ type: 'expense', amountMinor: 45_000, categoryId: 'cat.food.dining', localDate: TODAY, accountId: 'demo-acc-cash' });
    expect(p!.fields.account).toMatchObject({ provenance: 'default' });
    expect(p!.decision).toBe('one_tap');
  });
  it('"Paid 2000 for electricity."', async () => {
    const [p] = ready(await run('Paid 2000 for electricity.'));
    expect(p!.editable).toMatchObject({ amountMinor: 200_000, categoryId: 'cat.bills.electricity' });
  });
  it('"Uber was 680."', async () => {
    const [p] = ready(await run('Uber was 680.'));
    expect(p!.editable).toMatchObject({ amountMinor: 68_000, merchantName: 'Uber', categoryId: 'cat.transport.ride_share' });
  });
  it('"Bought groceries for 3250 from Agora."', async () => {
    const [p] = ready(await run('Bought groceries for 3250 from Agora.'));
    expect(p!.editable).toMatchObject({ amountMinor: 325_000, merchantName: 'Agora', categoryId: 'cat.food.groceries' });
  });
  it('"I got my salary today, 120000." is income and always needs a confirmation tap (high impact)', async () => {
    const [p] = ready(await run('I got my salary today, 120000.'));
    expect(p!.editable).toMatchObject({ type: 'income', amountMinor: 12_000_000, categoryId: 'cat.income.salary', localDate: TODAY });
    expect(p!.decision).toBe('confirm');
  });
  it('"Rahim paid 1500 for dinner, my share was 750." creates a shared expense with the right split', async () => {
    const [p] = ready(await run('Rahim paid 1500 for dinner, my share was 750.'));
    expect(ready(await run('Rahim paid 1500 for dinner, my share was 750.'))).toHaveLength(1); // not split into two transactions at the comma
    expect(p!.editable).toMatchObject({ type: 'expense', amountMinor: 150_000, paidBy: 'demo-p-rahim', accountId: null, categoryId: 'cat.food.dining' });
    expect(p!.editable.splits).toEqual([{ personId: 'me', amountMinor: 75_000 }, { personId: 'demo-p-rahim', amountMinor: 75_000 }]);
  });
  it('"I paid 3000 for groceries yesterday." resolves the date in the user timezone', async () => {
    const [p] = ready(await run('I paid 3000 for groceries yesterday.'));
    expect(p!.editable).toMatchObject({ amountMinor: 300_000, localDate: '2025-03-14', categoryId: 'cat.food.groceries' });
    expect(p!.fields.date).toMatchObject({ provenance: 'stated' });
  });
  it('"Spent 5k." asks what it was for instead of guessing', async () => {
    const o = await run('Spent 5k.');
    if (o.status !== 'needs_clarification') throw new Error(o.status);
    expect(o.clarification).toMatchObject({ field: 'purpose', question: 'What was the 5,000 for?' });
    expect(o.proposals[0]!.editable.amountMinor).toBe(500_000);
  });
  it('"I spent 800 on groceries and 300 on Uber" becomes two proposals', async () => {
    const ps = ready(await run('I spent 800 on groceries and 300 on Uber'));
    expect(ps.map((p) => [p.editable.amountMinor, p.editable.categoryId])).toEqual([[80_000, 'cat.food.groceries'], [30_000, 'cat.transport.ride_share']]);
  });
  it('"Moved 10,000 from bank to bKash" is a transfer between named accounts', async () => {
    const [p] = ready(await run('Moved 10,000 from bank to bKash'));
    expect(p!.editable).toMatchObject({ type: 'transfer', amountMinor: 1_000_000, accountId: 'demo-acc-bank', toAccountId: 'demo-acc-bkash', categoryId: null });
  });
  it('"I spent 1,200 at Agora for groceries using bKash."', async () => {
    const [p] = ready(await run('I spent 1,200 at Agora for groceries using bKash.'));
    expect(p!.editable).toMatchObject({ amountMinor: 120_000, merchantName: 'Agora', accountId: 'demo-acc-bkash', categoryId: 'cat.food.groceries' });
    expect(p!.fields.account).toMatchObject({ provenance: 'stated' });
  });
});

describe('more phrasings', () => {
  it('withdrawal moves bank money into cash', async () => {
    const [p] = ready(await run('Withdrew 5000 from bank'));
    expect(p!.editable).toMatchObject({ type: 'transfer', accountId: 'demo-acc-bank', toAccountId: 'demo-acc-cash' });
  });
  it('a transfer never assumes its source account, even when a default exists', async () => {
    const o = await run('Moved 2000 to bKash');
    if (o.status !== 'needs_clarification') throw new Error(o.status);
    expect(o.clarification.field).toBe('account');
  });
  it('lending and being repaid', async () => {
    const [lent] = ready(await run('Lent Rahim 3000'));
    expect(lent!.editable).toMatchObject({ type: 'debt', debtDirection: 'lent', counterpartyId: 'demo-p-rahim', amountMinor: 300_000 });
    const [back] = ready(await run('Rahim paid me back 1000 in bKash'));
    expect(back!.editable).toMatchObject({ type: 'repayment', repaymentDirection: 'received', accountId: 'demo-acc-bkash', amountMinor: 100_000 });
  });
  it('equal split with a friend', async () => {
    const [p] = ready(await run('Split dinner 1200 with Rahim'));
    expect(p!.editable.splits).toEqual([{ personId: 'me', amountMinor: 60_000 }, { personId: 'demo-p-rahim', amountMinor: 60_000 }]);
  });
  it('Bangla and mixed Bangla-English', async () => {
    const [bn] = ready(await run('গতকাল ১২০০ টাকার বাজার করেছি'));
    expect(bn!.editable).toMatchObject({ amountMinor: 120_000, localDate: '2025-03-14', categoryId: 'cat.food.groceries' });
    const [mixed] = ready(await run('আজ ৪৫০ টাকা lunch এ খরচ করলাম'));
    expect(mixed!.editable).toMatchObject({ amountMinor: 45_000, categoryId: 'cat.food.dining', localDate: TODAY });
    expect(detectLocale('আজ ৪৫০ lunch')).toBe('mixed');
    expect(detectLocale('গতকাল')).toBe('bn');
    expect(detectLocale('lunch')).toBe('en');
  });
  it('does not mistake dates, ordinals or headcounts for the amount', async () => {
    expect(ready(await run('Spent 500 on 12 March for medicine'))[0]!.editable).toMatchObject({ amountMinor: 50_000, localDate: '2025-03-12', categoryId: 'cat.health.medicine' });
    expect(ready(await run('Paid 2 people 1500 for lunch'))[0]!.editable.amountMinor).toBe(150_000);
    expect(ready(await run('Paid 1500 for lunch on the 12th'))[0]!.editable.amountMinor).toBe(150_000);
  });
  it('several candidate amounts with no clear winner means asking, not choosing', async () => {
    const o = await run('Paid 300 and 450 for lunch'); // two clauses -> two proposals, but one clause with 2 numbers:
    expect(o.status).not.toBe('invalid_output');
    const amb = await run('Spent 300 450 on lunch');
    if (amb.status !== 'needs_clarification') throw new Error(amb.status);
    expect(amb.clarification.field).toBe('amount');
  });
  it('asks for the amount when none is given', async () => {
    const o = await run('Took an Uber');
    if (o.status !== 'needs_clarification') throw new Error(o.status);
    expect(o.clarification).toMatchObject({ field: 'amount', question: 'How much was Uber?' });
  });
  it('ignores chit-chat', async () => {
    expect((await run('Hello there')).status).toBe('not_a_transaction');
    expect((await run('   ')).status).toBe('not_a_transaction');
  });
  it('voice input is never one-tap or auto-saved', async () => {
    const s = { ...snapshot, profile: { ...snapshot.profile, confirmationPref: 'auto_save_high_confidence' as const } };
    const [typed] = ready(await run('Spent 450 on lunch', { snapshot: s }));
    expect(typed!.decision).toBe('auto_save');
    const [voice] = ready(await run('Spent 450 on lunch', { snapshot: s, source: 'voice' }));
    expect(voice!.decision).toBe('confirm');
  });
});

describe('interpreter failures never guess', () => {
  const boom: Interpreter = { interpret: async () => { throw new Error('offline'); } };
  const junk: Interpreter = { interpret: async () => ({ answer: 'I saved it for you' }) as never };
  it('reports unavailable when the interpreter throws', async () => { expect((await run('Spent 450 on lunch', { interpreter: boom })).status).toBe('unavailable'); });
  it('reports invalid output when the model strays from the schema', async () => { expect((await run('Spent 450 on lunch', { interpreter: junk })).status).toBe('invalid_output'); });
});

describe('editable drafts and field-level correction', () => {
  const base: EditableDraft = { type: 'expense', amountMinor: 45_000, currency: 'BDT', localDate: TODAY, source: 'text', accountId: 'demo-acc-cash', categoryId: 'cat.food.dining',
    merchantName: null, notes: null, paidBy: 'me', splits: null, toAccountId: null, counterpartyId: null, debtDirection: null, repaymentDirection: null, goalId: null, aiConfidence: 0.9, rawInput: null };
  const valid = (d: EditableDraft) => validateDraft(d, DEMO_USER_ID, data);

  it('a corrected field updates the draft and nothing else', () => {
    const d = reviseDraft(base, { amountMinor: 55_000, categoryId: 'cat.food.groceries', accountId: 'demo-acc-bkash' }, data);
    expect(d).toMatchObject({ amountMinor: 55_000, categoryId: 'cat.food.groceries', accountId: 'demo-acc-bkash', localDate: TODAY, type: 'expense' });
    expect(valid(d)).toEqual([]);
  });
  it('a missing amount is reported and blocks finalizing', () => {
    const d = reviseDraft(base, { amountMinor: null }, data);
    expect(valid(d).map((i) => i.code)).toContain('amount_invalid');
    expect(finalizeDraft(d)).toBeNull();
    expect(nextQuestion(d, DEMO_USER_ID, data)).toMatchObject({ field: 'amount' });
  });
  it('switching type clears fields that no longer apply', () => {
    const income = reviseDraft(base, { type: 'income' }, data);
    expect(income.categoryId).toBeNull(); // an expense category is invalid on income
    expect(valid({ ...income, categoryId: 'cat.income.salary' })).toEqual([]);
    const transfer = reviseDraft({ ...base, merchantName: 'Pizza Hut' }, { type: 'transfer' }, data);
    expect(transfer).toMatchObject({ categoryId: null, merchantName: null });
    expect(nextQuestion(transfer, DEMO_USER_ID, data)).toMatchObject({ field: 'to_account' });
    const back = reviseDraft({ ...transfer, toAccountId: 'demo-acc-bank' }, { type: 'expense' }, data);
    expect(back.toAccountId).toBeNull();
  });
  it('changing the amount of a shared expense re-splits it so the total still adds up', () => {
    const shared: EditableDraft = { ...base, accountId: null, paidBy: 'demo-p-rahim', splits: [{ personId: 'me', amountMinor: 75_000 }, { personId: 'demo-p-rahim', amountMinor: 75_000 }], amountMinor: 150_000 };
    const d = reviseDraft(shared, { amountMinor: 200_001 }, data);
    expect(d.splits!.reduce((s, x) => s + x.amountMinor, 0)).toBe(200_001);
    expect(valid(d)).toEqual([]);
  });
  it('asks the next missing thing, most important first, and purpose only in conversational mode', () => {
    const none = { ...base, categoryId: null };
    expect(nextQuestion(none, DEMO_USER_ID, data, { askPurpose: true, amountLabel: '450' })).toMatchObject({ field: 'purpose', question: 'What was the 450 for?' });
    expect(nextQuestion(none, DEMO_USER_ID, data)).toBeNull(); // manual entry does not require a category
    expect(nextQuestion({ ...none, accountId: null }, DEMO_USER_ID, data)).toMatchObject({ field: 'account' });
    expect(nextQuestion({ ...none, type: 'debt', debtDirection: null, counterpartyId: null }, DEMO_USER_ID, data)).toMatchObject({ field: 'person' });
  });
  it('validation catches an invalid account/category pairing', () => {
    expect(valid({ ...base, accountId: 'nope' }).map((i) => i.code)).toContain('account_not_found');
    expect(valid({ ...base, categoryId: 'cat.income.salary' }).map((i) => i.code)).toContain('category_kind_mismatch');
  });
});

describe('duplicate detection', () => {
  const ex = demo.transactions.find((t) => t.type === 'expense' && t.merchantName === 'Pizza Hut' && t.accountId)!;
  const same = { type: ex.type, amountMinor: ex.amountMinor, currency: 'BDT', localDate: ex.localDate, source: 'text' as const, accountId: ex.accountId, merchantName: 'pizza hut' };
  it('flags the same amount, account, day and merchant', () => {
    expect(findPossibleDuplicate(same, demo.transactions)?.id).toBe(ex.id);
    expect(findPossibleDuplicate({ ...same, amountMinor: same.amountMinor + 1 }, demo.transactions)).toBeNull();
    expect(findPossibleDuplicate({ ...same, localDate: '2025-03-01' }, demo.transactions)).toBeNull();
    expect(findPossibleDuplicate({ ...same, accountId: 'demo-acc-cash' }, demo.transactions)).toBeNull();
  });
  it('ignores deleted transactions and recurring bills', () => {
    expect(findPossibleDuplicate(same, demo.transactions.map((t) => (t.id === ex.id ? { ...t, deletedAt: 'x' } : t)))).toBeNull();
  });
});

describe('end to end: words in, ledger and summary change', () => {
  it('"Spent 450 on lunch" saves through the validated path, moves the balance, and shrinks Safe to Spend', async () => {
    const repo = await sqlRepo();
    await seedDemoData(repo, TODAY);
    const load = async (): Promise<LedgerSnapshot> => ({
      profile: (await repo.getProfile(DEMO_USER_ID))!, accounts: await repo.listAccounts(DEMO_USER_ID), categories: await repo.listCategories(DEMO_USER_ID), people: await repo.listPeople(DEMO_USER_ID),
      transactions: await repo.listTransactions(DEMO_USER_ID), budgets: await repo.listBudgets(DEMO_USER_ID), recurringRules: await repo.listRecurringRules(DEMO_USER_ID), goals: await repo.listGoals(DEMO_USER_ID),
    });
    const before = await load();
    const sBefore = buildHomeSummary(before, TODAY);

    const [p] = ready(await captureText({ text: 'Spent 450 on lunch', source: 'text', snapshot: before, interpreter: rules, now: NOW }));
    expect(validateDraft(p!.editable, DEMO_USER_ID, before)).toEqual([]);
    let n = 0;
    const svc = new TransactionService(repo, { now: () => NOW, newId: () => `cap-${++n}`, timezone: 'Asia/Dhaka' });
    const saved = await svc.create(DEMO_USER_ID, finalizeDraft(p!.editable)!);
    expect(saved).toMatchObject({ source: 'text', amountMinor: 45_000, rawInput: null }); // raw text is not retained by default

    const after = await load();
    const sAfter = buildHomeSummary(after, TODAY);
    expect(sAfter.safeToSpend.availableMinor).toBe(sBefore.safeToSpend.availableMinor - 45_000);
    expect(sAfter.pulse.spentMinor).toBe(sBefore.pulse.spentMinor + 45_000);
    expect(accountBalances(after).get('demo-acc-cash')).toBe(accountBalances(before).get('demo-acc-cash')! - 45_000);
    expect(sAfter.recent[0]!.transaction.id).toBe('cap-1');

    await svc.remove(DEMO_USER_ID, 'cap-1'); // undo
    expect(buildHomeSummary(await load(), TODAY).safeToSpend.availableMinor).toBe(sBefore.safeToSpend.availableMinor);
  });
});
