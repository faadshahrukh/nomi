import { extractAmounts, parseAmountText, type CurrencyCode } from '../money';
import { resolveDateRef, type LocalDate } from '../dates';
import { validateTransaction, type Issue } from '../ledger';
import type { Account, Category, Goal, Id, LedgerData, Person, Transaction } from '../types';
import { InterpretationSchema, type ProposedTransaction } from './schema';
import { decide, type ConfirmationPreference, type Decision } from './policy';
import type { TransactionInput } from '../transactionService';

export interface ResolveContext {
  userId: Id; rawText: string; today: LocalDate; defaultCurrency: CurrencyCode;
  accounts: Account[]; categories: Category[]; people: Person[]; goals: Goal[];
  defaultAccountId: Id | null;
  source: 'text' | 'voice'; preference: ConfirmationPreference; highImpactMinor?: number;
}

export type ClarifyField = 'amount' | 'purpose' | 'account' | 'to_account' | 'person' | 'goal' | 'direction' | 'date' | 'unclear';
export interface Clarification { field: ClarifyField; question: string; proposalIndex: number | null }

export type Provenance = 'stated' | 'inferred' | 'default';
export interface FieldReading { value: string | number | null; confidence: number; provenance: Provenance }

export interface ResolvedProposal {
  index: number;
  /** Complete draft ready for TransactionService.create, or null when it cannot be built. */
  draft: TransactionInput | null;
  /** What the app understood, for the "what I heard" card and field-by-field correction. */
  fields: Partial<Record<'type' | 'amount' | 'category' | 'merchant' | 'account' | 'toAccount' | 'date' | 'notes' | 'paidBy' | 'counterparty', FieldReading>>;
  issues: Issue[];
  confidence: number;
  decision: Decision;
  clarification: Clarification | null;
}

export type ResolvedCapture =
  | { status: 'invalid_output' }                    // model returned something outside the schema: fall back to manual entry
  | { status: 'not_a_transaction' }
  | { status: 'needs_clarification'; clarification: Clarification; proposals: ResolvedProposal[] }
  | { status: 'ready'; proposals: ResolvedProposal[] };

const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase();

function findByName<T extends { name: string }>(items: T[], name: string | null, extra?: (i: T) => string[]): T | undefined {
  if (!name) return undefined;
  const n = norm(name);
  return items.find((i) => norm(i.name) === n || (extra?.(i) ?? []).some((a) => norm(a) === n))
    ?? items.find((i) => norm(i.name).includes(n) || n.includes(norm(i.name)));
}

const Q = {
  amount: (hint?: string) => (hint ? `How much was ${hint}?` : 'How much was it?'),
  purpose: (amountLabel: string) => `What was the ${amountLabel} for?`,
  account: 'Which account did this go through?',
  to_account: 'Which account did the money move to?',
  person: 'Who was this with?',
  goal: 'Which goal is this for?',
  direction: 'Did you lend it, or borrow it?',
  date: 'Which day was this?',
  unclear: 'What happened with your money?',
};

function resolveOne(p: ProposedTransaction, index: number, count: number, ctx: ResolveContext): ResolvedProposal {
  const issues: Issue[] = [];
  const fields: ResolvedProposal['fields'] = {};
  let clarification: Clarification | null = null;
  const ask = (field: ClarifyField, question: string) => { clarification ??= { field, question, proposalIndex: count > 1 ? index : null }; };
  const currency = (p.currency ?? ctx.defaultCurrency).toUpperCase();
  const prov = (hasValue: boolean, c: number): Provenance => (!hasValue ? 'default' : c >= 0.8 ? 'stated' : 'inferred');

  // --- amount: parsed deterministically, then checked against what the user actually said
  let amountMinor: number | null = null;
  let amountNotInInput = false;
  try {
    amountMinor = p.amountText ? parseAmountText(p.amountText, currency) : null;
    if (amountMinor != null) amountNotInInput = !extractAmounts(ctx.rawText, currency).includes(amountMinor);
  } catch { amountMinor = null; }
  fields.amount = { value: amountMinor, confidence: amountNotInInput ? Math.min(p.confidence.amount, 0.5) : p.confidence.amount, provenance: 'stated' };
  if (amountMinor == null) issues.push({ code: 'amount_invalid', field: 'amount', message: 'No usable amount.' });

  // --- date
  const dr = resolveDateRef(p.date, ctx.today);
  if (!dr.date) { issues.push({ code: 'date_invalid', field: 'date', message: 'Invalid date.' }); ask('date', Q.date); }
  else if (dr.date > ctx.today) issues.push({ code: 'date_invalid', field: 'date', message: 'Date is in the future.' });
  fields.date = { value: dr.date, confidence: dr.explicit ? p.confidence.date : 1, provenance: dr.explicit ? 'stated' : 'default' };

  // --- category / merchant / notes
  const cat = findByName(ctx.categories.filter((c) => !c.archivedAt), p.categoryName);
  if (p.categoryName && !cat) issues.push({ code: 'category_not_found', field: 'category', message: `Unknown category "${p.categoryName}".` });
  fields.category = { value: cat?.id ?? null, confidence: cat ? p.confidence.category : 0, provenance: cat ? prov(true, p.confidence.category) : 'default' };
  fields.merchant = { value: p.merchantName, confidence: p.merchantName ? 1 : 0, provenance: p.merchantName ? 'stated' : 'default' };
  fields.notes = { value: p.notes, confidence: 1, provenance: p.notes ? 'stated' : 'default' };

  // --- accounts
  const liveAccounts = ctx.accounts.filter((a) => !a.archivedAt);
  const accountByName = findByName(liveAccounts, p.accountName, (a) => a.aliases);
  const paidByOther = p.type === 'expense' && p.paidByName != null && norm(p.paidByName) !== 'me';
  let account: Account | undefined = accountByName;
  let accountProv: Provenance = account ? 'stated' : 'default';
  if (!account && !paidByOther) {
    if (p.accountName) { issues.push({ code: 'account_not_found', field: 'account', message: `Unknown account "${p.accountName}".` }); ask('account', Q.account); }
    else if (liveAccounts.length === 1) account = liveAccounts[0];
    else if (ctx.defaultAccountId) account = liveAccounts.find((a) => a.id === ctx.defaultAccountId);
    if (!account && !p.accountName) { issues.push({ code: 'account_required', field: 'account', message: 'Account unknown.' }); ask('account', Q.account); }
  }
  fields.account = paidByOther ? undefined : { value: account?.id ?? null, confidence: accountProv === 'stated' ? p.confidence.account : account ? 1 : 0, provenance: accountProv };
  const toAccount = findByName(liveAccounts, p.toAccountName, (a) => a.aliases);
  const internal = p.type === 'transfer' || p.type === 'savings_contribution' || p.type === 'goal_contribution';
  if (internal) {
    if (!toAccount) { issues.push({ code: 'to_account_required', field: 'toAccount', message: 'Destination unknown.' }); ask('to_account', Q.to_account); }
    fields.toAccount = { value: toAccount?.id ?? null, confidence: toAccount ? p.confidence.account : 0, provenance: toAccount ? 'stated' : 'default' };
  }

  // --- people, shares, debt
  const person = (name: string | null) => (name ? findByName(ctx.people, name) : undefined);
  let paidBy: Id | 'me' = 'me';
  let splits: Transaction['splits'] = null;
  if (p.type === 'expense' && p.shares?.length) {
    if (paidByOther) { const payer = person(p.paidByName); if (payer) paidBy = payer.id; else { issues.push({ code: 'party_not_found', field: 'paidBy', message: 'Unknown person.' }); ask('person', Q.person); } }
    const parsed = p.shares.map((s) => ({ s, who: norm(s.personName) === 'me' ? ('me' as const) : person(s.personName)?.id, amt: s.amountText ? parseAmountText(s.amountText, currency) : null }));
    if (parsed.some((x) => !x.who)) { issues.push({ code: 'party_not_found', field: 'splits', message: 'Unknown person in split.' }); ask('person', Q.person); }
    else if (amountMinor != null) {
      const missing = parsed.filter((x) => x.amt == null);
      const known = parsed.reduce((sum, x) => sum + (x.amt ?? 0), 0);
      if (missing.length === 1) splits = parsed.map((x) => ({ personId: x.who!, amountMinor: x.amt ?? amountMinor - known }));
      else if (missing.length === 0) splits = parsed.map((x) => ({ personId: x.who!, amountMinor: x.amt! }));
      else issues.push({ code: 'splits_invalid', field: 'splits', message: 'Split amounts unclear.' });
    }
    fields.paidBy = { value: paidBy, confidence: p.confidence.type, provenance: 'stated' };
  }
  let counterpartyId: Id | null = null;
  if (p.type === 'debt' || p.type === 'repayment') {
    const cp = person(p.counterpartyName);
    if (!cp) { issues.push({ code: 'counterparty_required', field: 'counterparty', message: 'Who is this with?' }); ask('person', Q.person); } else counterpartyId = cp.id;
    fields.counterparty = { value: counterpartyId, confidence: cp ? 1 : 0, provenance: cp ? 'stated' : 'default' };
  }
  const wantsDir = p.type === 'debt' ? ['lent', 'borrowed'] : p.type === 'repayment' ? ['received', 'paid'] : [];
  const dirOk = !!p.direction && wantsDir.includes(p.direction);
  if (wantsDir.length && !dirOk) { issues.push({ code: 'direction_required', field: 'direction', message: 'Direction unclear.' }); ask('direction', Q.direction); }
  const goal = p.goalName ? findByName(ctx.goals, p.goalName) : undefined;
  if (p.type === 'goal_contribution' && !goal) { issues.push({ code: 'goal_required', field: 'goal', message: 'Goal unknown.' }); ask('goal', Q.goal); }

  // --- critical clarifications, minimum necessary, in order of importance
  if (amountMinor == null) ask('amount', Q.amount(p.merchantName ?? p.categoryName ?? undefined));
  // "Spent 5k": an amount with no hint of what it was for. Ask for the purpose, never guess a category.
  if (p.type === 'expense' && amountMinor != null && !cat && !p.merchantName && !p.notes && !paidByOther)
    ask('purpose', Q.purpose(`${amountMinor / 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')));

  fields.type = { value: p.type, confidence: p.confidence.type, provenance: 'stated' };

  // --- build + validate the draft against the ledger
  let draft: TransactionInput | null = null;
  const blocking = clarification !== null;
  if (!blocking && amountMinor != null && dr.date) {
    draft = {
      type: p.type, amountMinor, currency, localDate: dr.date, source: ctx.source,
      accountId: paidByOther ? null : account?.id ?? null, toAccountId: internal ? toAccount?.id ?? null : null,
      categoryId: cat?.id ?? null, merchantName: p.merchantName, notes: p.notes, paidBy, splits,
      counterpartyId, debtDirection: p.type === 'debt' && dirOk ? (p.direction as 'lent' | 'borrowed') : null,
      repaymentDirection: p.type === 'repayment' && dirOk ? (p.direction as 'received' | 'paid') : null,
      goalId: goal?.id ?? null, aiConfidence: null, rawInput: ctx.rawText,
    };
    const ledger: LedgerData = { accounts: ctx.accounts, categories: ctx.categories, people: ctx.people, transactions: [] };
    const full: Transaction = { categoryId: null, merchantName: null, accountId: null, toAccountId: null, localTime: null, notes: null, paidBy: 'me', splits: null,
      counterpartyId: null, debtDirection: null, repaymentDirection: null, goalId: null, recurringRuleId: null, occurrenceDate: null, aiConfidence: null, rawInput: null,
      ...draft, id: 'draft', userId: ctx.userId, createdAt: '', updatedAt: '', deletedAt: null, version: 0 };
    const v = validateTransaction(full, ledger).filter((i) => !issues.some((x) => x.code === i.code && x.field === i.field));
    issues.push(...v);
  }
  const hardIssue = issues.some((i) => i.code !== 'category_not_found');
  if (hardIssue && !clarification) ask('unclear', Q.unclear);

  const parts = [fields.type!.confidence, fields.amount!.confidence, fields.date!.confidence];
  if (fields.account && fields.account.provenance === 'stated') parts.push(fields.account.confidence);
  if (fields.category && fields.category.provenance !== 'default') parts.push(fields.category.confidence);
  const confidence = Math.min(...parts);
  if (draft) draft.aiConfidence = confidence;

  const decision = decide({
    type: p.type, amountMinor, confidence, blockingIssue: hardIssue || clarification !== null, amountNotInInput,
    hasWarnings: issues.length > 0 || fields.category?.provenance === 'inferred', isShared: !!splits, proposalCount: count,
    preference: ctx.preference, highImpactMinor: ctx.highImpactMinor, source: ctx.source,
  });
  // Low confidence with nothing missing: ask about the weakest critical field.
  const finalClar = decision === 'clarify' && !clarification ? { field: 'unclear' as ClarifyField, question: Q.unclear, proposalIndex: count > 1 ? index : null } : clarification;
  return { index, draft: decision === 'clarify' ? null : draft, fields, issues, confidence, decision, clarification: finalClar };
}

/** Validates and resolves raw model output. Never throws; unusable output becomes `invalid_output` so the UI can offer manual entry. */
export function resolveInterpretation(raw: unknown, ctx: ResolveContext): ResolvedCapture {
  const parsed = InterpretationSchema.safeParse(raw);
  if (!parsed.success) return { status: 'invalid_output' };
  if (parsed.data.status === 'not_a_transaction' || parsed.data.transactions.length === 0) return { status: 'not_a_transaction' };
  const n = parsed.data.transactions.length;
  const proposals = parsed.data.transactions.map((t, i) => resolveOne(t, i, n, ctx));
  const first = proposals.find((p) => p.clarification);
  return first?.clarification ? { status: 'needs_clarification', clarification: first.clarification, proposals } : { status: 'ready', proposals };
}
