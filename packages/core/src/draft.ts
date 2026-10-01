import { equalSplit } from './money';
import { validateTransaction, type Issue } from './ledger';
import type { TransactionInput } from './transactionService';
import type { Id, LedgerData, Transaction } from './types';

/**
 * A transaction the user is still working on. Identical to TransactionInput except the amount may be missing,
 * so a half-understood capture can be shown, completed field by field, and only saved once it validates.
 */
export interface EditableDraft extends Omit<TransactionInput, 'amountMinor'> { amountMinor: number | null }

export type ClarifyField = 'amount' | 'purpose' | 'account' | 'to_account' | 'person' | 'goal' | 'direction' | 'date' | 'unclear';
export interface Clarification { field: ClarifyField; question: string; proposalIndex: number | null }

export const QUESTIONS = {
  amount: (hint?: string) => (hint ? `How much was ${hint}?` : 'How much was it?'),
  purpose: (amountLabel: string) => `What was the ${amountLabel} for?`,
  account: 'Which account did this go through?',
  to_account: 'Which account did the money move to?',
  person: 'Who was this with?',
  goal: 'Which goal is this for?',
  direction: 'Did you lend it, or borrow it?',
  date: 'Which day was this?',
  unclear: 'What happened with your money?',
} as const;

const isInternal = (t: EditableDraft['type']) => t === 'transfer' || t === 'savings_contribution' || t === 'goal_contribution';

function asTransaction(d: EditableDraft, userId: Id): Transaction {
  return {
    categoryId: null, merchantName: null, accountId: null, toAccountId: null, localTime: null, notes: null, paidBy: 'me', splits: null,
    counterpartyId: null, debtDirection: null, repaymentDirection: null, goalId: null, recurringRuleId: null, occurrenceDate: null,
    aiConfidence: null, rawInput: null, ...d, amountMinor: d.amountMinor ?? 0,
    id: 'draft', userId, createdAt: '', updatedAt: '', deletedAt: null, version: 0,
  };
}

/** Every problem that would stop this draft from being saved. Empty means it can be saved. */
export function validateDraft(d: EditableDraft, userId: Id, data: LedgerData): Issue[] {
  return validateTransaction(asTransaction(d, userId), { ...data, transactions: [] });
}

/** The savable form of a draft, or null while the amount is still missing. Does not validate; call validateDraft first. */
export function finalizeDraft(d: EditableDraft): TransactionInput | null {
  return d.amountMinor === null ? null : { ...d, amountMinor: d.amountMinor };
}

/**
 * The single most useful thing to ask next, or null when nothing is missing. Asks for the minimum needed, most important first.
 * `askPurpose` is for conversational capture ("Spent 5k" needs a purpose); manual entry does not require one.
 */
export function nextQuestion(d: EditableDraft, userId: Id, data: LedgerData, opts: { askPurpose?: boolean; proposalIndex?: number | null; amountLabel?: string } = {}): Clarification | null {
  const idx = opts.proposalIndex ?? null;
  const q = (field: ClarifyField, question: string): Clarification => ({ field, question, proposalIndex: idx });
  if (d.amountMinor === null || d.amountMinor <= 0) return q('amount', QUESTIONS.amount(d.merchantName ?? undefined));
  const issues = validateDraft(d, userId, data);
  const has = (code: Issue['code']) => issues.some((i) => i.code === code);
  const paidByOther = d.type === 'expense' && d.paidBy !== 'me';
  if (opts.askPurpose && d.type === 'expense' && !paidByOther && !d.categoryId && !d.merchantName && !d.notes) return q('purpose', QUESTIONS.purpose(opts.amountLabel ?? 'amount'));
  if (has('account_required')) return q('account', QUESTIONS.account);
  if (has('to_account_required')) return q('to_account', QUESTIONS.to_account);
  if (has('counterparty_required') || (has('party_not_found') && (d.type === 'debt' || d.type === 'repayment'))) return q('person', QUESTIONS.person);
  if (has('direction_required')) return q('direction', QUESTIONS.direction);
  if (has('goal_required')) return q('goal', QUESTIONS.goal);
  if (has('date_invalid')) return q('date', QUESTIONS.date);
  return null;
}

/**
 * Applies a correction to one or more fields and keeps the rest coherent:
 *  - changing the type clears fields that no longer apply (a transfer has no category; income has no destination account)
 *  - changing the amount of a shared expense resets the split to equal among the same people
 * The result is NOT validated; the caller runs validateDraft and shows what is still wrong.
 */
export function reviseDraft(d: EditableDraft, patch: Partial<EditableDraft>, data: LedgerData): EditableDraft {
  let next: EditableDraft = { ...d, ...patch };
  if (patch.type && patch.type !== d.type) {
    if (isInternal(next.type)) next = { ...next, categoryId: null, merchantName: null, splits: null, paidBy: 'me', counterpartyId: null, debtDirection: null, repaymentDirection: null };
    else { next = { ...next, toAccountId: null }; }
    if (next.type !== 'debt') next = { ...next, debtDirection: null };
    if (next.type !== 'repayment') next = { ...next, repaymentDirection: null };
    if (next.type !== 'debt' && next.type !== 'repayment') next = { ...next, counterpartyId: null };
    if (next.type !== 'expense') next = { ...next, splits: null, paidBy: 'me' };
    const cat = next.categoryId ? data.categories.find((c) => c.id === next.categoryId) : null;
    if (cat && ((next.type === 'income' && cat.kind !== 'income') || ((next.type === 'expense' || next.type === 'refund') && cat.kind !== 'expense'))) next = { ...next, categoryId: null };
  }
  if ('amountMinor' in patch && patch.amountMinor !== d.amountMinor && next.splits && next.amountMinor !== null && next.amountMinor > 0) {
    next = { ...next, splits: equalSplit(next.amountMinor, next.splits.map((s) => s.personId)) };
  }
  return next;
}

/** An existing, live transaction that looks like the one about to be saved (same type, amount, accounts and day, and same merchant or category). */
export function findPossibleDuplicate(d: TransactionInput, existing: Transaction[]): Transaction | null {
  const norm = (s: string | null) => (s ?? '').trim().toLowerCase();
  return existing.find((t) => !t.deletedAt && t.type === d.type && t.amountMinor === d.amountMinor && t.localDate === d.localDate
    && t.accountId === (d.accountId ?? null) && t.toAccountId === (d.toAccountId ?? null) && !t.recurringRuleId
    && (norm(t.merchantName) === norm(d.merchantName ?? null) || (t.categoryId !== null && t.categoryId === (d.categoryId ?? null)))) ?? null;
}
