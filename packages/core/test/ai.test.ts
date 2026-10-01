import { describe, expect, it } from 'vitest';
import { decide, resolveInterpretation, TransactionService, InMemoryLedgerRepository, type ProposedTransaction, type ResolveContext } from '../src';
import { accounts, categories, setup, USER } from './fixtures';

const base = (over: Partial<ProposedTransaction> = {}): ProposedTransaction => ({
  type: 'expense', amountText: '450', currency: null, categoryName: 'Dining', merchantName: null, accountName: null, toAccountName: null,
  date: { kind: 'unspecified' }, notes: null, paidByName: null, shares: null, counterpartyName: null, direction: null, goalName: null,
  confidence: { type: 0.98, amount: 0.99, category: 0.92, account: 0.9, date: 0.9 }, ...over,
});
const wrap = (...t: ProposedTransaction[]) => ({ status: 'ok', transactions: t });
const ctx = (text: string, over: Partial<ResolveContext> = {}): ResolveContext => ({
  userId: USER, rawText: text, today: '2025-03-15', defaultCurrency: 'BDT', accounts, categories,
  people: [{ id: 'rahim', userId: USER, name: 'Rahim' }], goals: [], defaultAccountId: 'cash', source: 'text', preference: 'always_confirm', ...over,
});

describe('structured output validation', () => {
  it('rejects anything outside the schema instead of guessing', () => {
    expect(resolveInterpretation({ foo: 1 }, ctx('x')).status).toBe('invalid_output');
    expect(resolveInterpretation('Sure! I saved 450 for you.', ctx('x')).status).toBe('invalid_output');
    expect(resolveInterpretation(wrap(base({ type: 'gift' as never })), ctx('x')).status).toBe('invalid_output');
    expect(resolveInterpretation(wrap(base({ confidence: { type: 2, amount: 1, category: 1, account: 1, date: 1 } })), ctx('x')).status).toBe('invalid_output');
  });
  it('handles non-transactions', () => {
    expect(resolveInterpretation({ status: 'not_a_transaction', transactions: [] }, ctx('hello')).status).toBe('not_a_transaction');
  });
});

describe('resolution and confirmation policy', () => {
  it('"Spent 450 on lunch": high confidence, defaulted date and account are labelled, one-tap by default', () => {
    const r = resolveInterpretation(wrap(base()), ctx('Spent 450 on lunch'));
    if (r.status !== 'ready') throw new Error(r.status);
    const p = r.proposals[0]!;
    expect(p.draft).toMatchObject({ amountMinor: 45_000, categoryId: 'dining', localDate: '2025-03-15', accountId: 'cash', currency: 'BDT' });
    expect(p.fields.date).toMatchObject({ provenance: 'default' });
    expect(p.fields.account).toMatchObject({ provenance: 'default' });
    expect(p.decision).toBe('one_tap');
  });
  it('auto-saves only when the user opted in and nothing is uncertain', () => {
    const r = resolveInterpretation(wrap(base()), ctx('Spent 450 on lunch', { preference: 'auto_save_high_confidence' }));
    if (r.status !== 'ready') throw new Error(r.status);
    expect(r.proposals[0]!.decision).toBe('auto_save');
  });
  it('requires explicit confirmation for high-impact amounts even with auto-save on', () => {
    const r = resolveInterpretation(wrap(base({ amountText: '25000', categoryName: 'Shopping' })), ctx('Bought a phone case for 25000', { preference: 'auto_save_high_confidence' }));
    if (r.status !== 'ready') throw new Error(r.status);
    expect(r.proposals[0]!.decision).toBe('confirm');
  });
  it('medium confidence asks for confirmation; low confidence asks a question', () => {
    const med = resolveInterpretation(wrap(base({ confidence: { type: 0.95, amount: 0.95, category: 0.75, account: 0.9, date: 0.9 } })), ctx('Spent 450 on lunch'));
    if (med.status !== 'ready') throw new Error(med.status);
    expect(med.proposals[0]!.decision).toBe('confirm');
    const low = resolveInterpretation(wrap(base({ confidence: { type: 0.95, amount: 0.95, category: 0.4, account: 0.9, date: 0.9 } })), ctx('Spent 450 on lunch'));
    expect(low.status).toBe('needs_clarification');
  });
  it('"Spent 5k": asks what it was for rather than assuming a category', () => {
    const r = resolveInterpretation(wrap(base({ amountText: '5k', categoryName: null })), ctx('Spent 5k'));
    if (r.status !== 'needs_clarification') throw new Error(r.status);
    expect(r.clarification).toMatchObject({ field: 'purpose', question: 'What was the 5,000 for?' });
    expect(r.proposals[0]!.draft).toBeNull();
  });
  it('asks for the amount when none was given', () => {
    const r = resolveInterpretation(wrap(base({ amountText: null, merchantName: 'Uber', categoryName: 'Ride share' })), ctx('Took an Uber'));
    if (r.status !== 'needs_clarification') throw new Error(r.status);
    expect(r.clarification.field).toBe('amount');
  });
  it('never trusts an amount the user did not say: forces explicit confirmation', () => {
    const r = resolveInterpretation(wrap(base({ amountText: '4500' })), ctx('Spent 450 on lunch'));
    if (r.status !== 'ready') throw new Error(r.status);
    expect(r.proposals[0]!.decision).toBe('confirm');
    expect(r.proposals[0]!.fields.amount!.confidence).toBeLessThanOrEqual(0.5);
  });
  it('parses Bangla digits and resolves relative dates deterministically', () => {
    const r = resolveInterpretation(wrap(base({ amountText: '১২০০', categoryName: 'Groceries', date: { kind: 'yesterday' } })), ctx('গতকাল ১২০০ টাকার বাজার'));
    if (r.status !== 'ready') throw new Error(r.status);
    expect(r.proposals[0]!.draft).toMatchObject({ amountMinor: 120_000, localDate: '2025-03-14', categoryId: 'groceries' });
    expect(r.proposals[0]!.fields.date).toMatchObject({ provenance: 'stated' });
  });
  it('matches account aliases, including Bangla names', () => {
    const r = resolveInterpretation(wrap(base({ accountName: 'বিকাশ', amountText: '1200', merchantName: 'Agora', categoryName: 'Groceries' })), ctx('I spent 1,200 at Agora for groceries using বিকাশ'));
    if (r.status !== 'ready') throw new Error(r.status);
    expect(r.proposals[0]!.draft).toMatchObject({ accountId: 'bkash', merchantName: 'Agora' });
  });
  it('asks which account when several exist and none is stated or defaulted', () => {
    const r = resolveInterpretation(wrap(base()), ctx('Spent 450 on lunch', { defaultAccountId: null }));
    if (r.status !== 'needs_clarification') throw new Error(r.status);
    expect(r.clarification.field).toBe('account');
  });
  it('does not invent an account that does not exist', () => {
    const r = resolveInterpretation(wrap(base({ accountName: 'Rocket' })), ctx('Spent 450 on lunch from Rocket'));
    if (r.status !== 'needs_clarification') throw new Error(r.status);
    expect(r.clarification.field).toBe('account');
  });
  it('splits multiple events into individually decided proposals and never auto-saves them', () => {
    const r = resolveInterpretation(wrap(base({ amountText: '800', categoryName: 'Groceries' }), base({ amountText: '300', categoryName: 'Ride share', merchantName: 'Uber' })),
      ctx('I spent 800 on groceries and 300 on Uber', { preference: 'auto_save_high_confidence' }));
    if (r.status !== 'ready') throw new Error(r.status);
    expect(r.proposals.map((p) => p.draft!.amountMinor)).toEqual([80_000, 30_000]);
    expect(r.proposals.every((p) => p.decision === 'one_tap')).toBe(true);
  });
  it('shared expense: "Rahim paid 1500 for dinner, my share was 750"', () => {
    const r = resolveInterpretation(wrap(base({ amountText: '1500', paidByName: 'Rahim', shares: [{ personName: 'me', amountText: '750' }, { personName: 'Rahim', amountText: null }] })),
      ctx('Rahim paid 1500 for dinner, my share was 750'));
    if (r.status !== 'ready') throw new Error(r.status);
    const d = r.proposals[0]!.draft!;
    expect(d).toMatchObject({ accountId: null, paidBy: 'rahim', amountMinor: 150_000 });
    expect(d.splits).toEqual([{ personId: 'me', amountMinor: 75_000 }, { personId: 'rahim', amountMinor: 75_000 }]);
    expect(r.proposals[0]!.decision).not.toBe('auto_save');
  });
  it('transfer needs both accounts and is never auto-saved', () => {
    const none = resolveInterpretation(wrap(base({ type: 'transfer', amountText: '10000', categoryName: null, accountName: 'bank', toAccountName: null })), ctx('Moved 10000 from bank'));
    if (none.status !== 'needs_clarification') throw new Error(none.status);
    expect(none.clarification.field).toBe('to_account');
    const ok = resolveInterpretation(wrap(base({ type: 'transfer', amountText: '10,000', categoryName: null, accountName: 'bank', toAccountName: 'bKash' })), ctx('Moved 10,000 from bank to bKash', { preference: 'auto_save_high_confidence' }));
    if (ok.status !== 'ready') throw new Error(ok.status);
    expect(ok.proposals[0]!.draft).toMatchObject({ type: 'transfer', accountId: 'bank', toAccountId: 'bkash' });
    expect(ok.proposals[0]!.decision).toBe('confirm'); // 10,000 is at the high-impact line
  });
  it('rejects future dates', () => {
    const r = resolveInterpretation(wrap(base({ date: { kind: 'absolute', date: '2025-04-01' } })), ctx('Spent 450 on lunch on April 1'));
    expect(r.status).toBe('needs_clarification');
  });
});

describe('policy table', () => {
  const p = { type: 'expense' as const, amountMinor: 10_000, confidence: 0.95, blockingIssue: false, amountNotInInput: false, hasWarnings: false, isShared: false, proposalCount: 1, preference: 'always_confirm' as const };
  it('follows the spec matrix', () => {
    expect(decide({ ...p, blockingIssue: true })).toBe('clarify');
    expect(decide({ ...p, amountMinor: null })).toBe('clarify');
    expect(decide(p)).toBe('one_tap');
    expect(decide({ ...p, confidence: 0.8 })).toBe('confirm');
    expect(decide({ ...p, confidence: 0.5 })).toBe('clarify');
    expect(decide({ ...p, preference: 'auto_save_high_confidence' })).toBe('auto_save');
    expect(decide({ ...p, preference: 'auto_save_high_confidence', type: 'income' })).toBe('one_tap');
    expect(decide({ ...p, preference: 'auto_save_high_confidence', hasWarnings: true })).toBe('one_tap');
  });
});

describe('end to end: interpretation -> validated creation -> deterministic totals', () => {
  it('a resolved draft is saved through the same validated path as manual entry', async () => {
    const { repo, svc } = setup();
    const r = resolveInterpretation(wrap(base()), ctx('Spent 450 on lunch'));
    if (r.status !== 'ready') throw new Error(r.status);
    const t = await svc.create(USER, r.proposals[0]!.draft!);
    expect(t).toMatchObject({ amountMinor: 45_000, source: 'text', rawInput: null });
    expect(repo.audit).toHaveLength(1);
  });
});
