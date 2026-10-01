import { inRange, isValidLocalDate, type DateRange } from './dates';
import type { Account, Category, Id, LedgerData, Transaction } from './types';

/** Pure, deterministic ledger rules. The only place balances and spending are defined. */

export type IssueCode =
  | 'amount_invalid' | 'currency_mismatch' | 'account_required' | 'account_not_found' | 'account_archived'
  | 'to_account_required' | 'transfer_same_account' | 'category_not_found' | 'category_kind_mismatch'
  | 'splits_required' | 'splits_sum_mismatch' | 'splits_invalid' | 'party_not_found'
  | 'counterparty_required' | 'direction_required' | 'goal_required' | 'date_invalid';

export interface Issue { code: IssueCode; field: string; message: string }

const MOVES_TO_ACCOUNT: Transaction['type'][] = ['transfer', 'savings_contribution', 'goal_contribution'];
export const isInternalMove = (t: Transaction['type']): boolean => MOVES_TO_ACCOUNT.includes(t);

/** Signed effect of one transaction on one account's balance, in minor units. */
export function effectOnAccount(tx: Transaction, accountId: Id): number {
  if (tx.deletedAt) return 0;
  const from = tx.accountId === accountId;
  const to = tx.toAccountId === accountId;
  const a = tx.amountMinor;
  switch (tx.type) {
    case 'expense': return from ? -a : 0;
    case 'income':
    case 'refund': return from ? a : 0;
    case 'transfer':
    case 'savings_contribution':
    case 'goal_contribution': return (from ? -a : 0) + (to ? a : 0);
    case 'debt': return from ? (tx.debtDirection === 'lent' ? -a : a) : 0;
    case 'repayment': return from ? (tx.repaymentDirection === 'received' ? a : -a) : 0;
  }
}

export function accountBalance(account: Account, transactions: Transaction[]): number {
  return transactions.reduce((sum, tx) => sum + effectOnAccount(tx, account.id), account.openingBalanceMinor);
}

export function accountBalances(data: Pick<LedgerData, 'accounts' | 'transactions'>): Map<Id, number> {
  return new Map(data.accounts.map((a) => [a.id, accountBalance(a, data.transactions)]));
}

/** The user's own cost of an expense: their split when shared, otherwise the full amount. */
export function myShareMinor(tx: Transaction): number {
  if (!tx.splits) return tx.amountMinor;
  return tx.splits.find((s) => s.personId === 'me')?.amountMinor ?? 0;
}

/** Transactions that count toward "spending" within a range: expenses (my share) minus refunds. Transfers, debt, repayments and savings never count. */
export function spendingTransactions(txs: Transaction[], range: DateRange): Transaction[] {
  return txs.filter((t) => !t.deletedAt && (t.type === 'expense' || t.type === 'refund') && inRange(t.localDate, range));
}

const spendingDelta = (t: Transaction): number => (t.type === 'refund' ? -t.amountMinor : myShareMinor(t));

export function netSpending(txs: Transaction[], range: DateRange): number {
  return spendingTransactions(txs, range).reduce((s, t) => s + spendingDelta(t), 0);
}

export function incomeTotal(txs: Transaction[], range: DateRange): number {
  return txs.filter((t) => !t.deletedAt && t.type === 'income' && inRange(t.localDate, range))
    .reduce((s, t) => s + t.amountMinor, 0);
}

/** Walks up to the top-level category. Returns null for uncategorised / unknown ids. */
export function rootCategoryId(categories: Category[], id: Id | null): Id | null {
  if (!id) return null;
  const byId = new Map(categories.map((c) => [c.id, c]));
  let cur = byId.get(id);
  for (let guard = 0; cur && cur.parentId && guard < 10; guard++) cur = byId.get(cur.parentId);
  return cur ? cur.id : null;
}

/** All ids in a category's subtree (itself + descendants). */
export function categorySubtree(categories: Category[], id: Id): Set<Id> {
  const out = new Set<Id>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) if (c.parentId && out.has(c.parentId) && !out.has(c.id)) { out.add(c.id); grew = true; }
  }
  return out;
}

/** Net spending per top-level category (null key = uncategorised). */
export function spendingByRootCategory(txs: Transaction[], categories: Category[], range: DateRange): Map<Id | null, number> {
  const out = new Map<Id | null, number>();
  for (const t of spendingTransactions(txs, range)) {
    const key = rootCategoryId(categories, t.categoryId);
    out.set(key, (out.get(key) ?? 0) + spendingDelta(t));
  }
  return out;
}

/** Net spending in a category and all its sub-categories. */
export function spendingInCategory(txs: Transaction[], categories: Category[], categoryId: Id, range: DateRange): number {
  const ids = categorySubtree(categories, categoryId);
  return spendingTransactions(txs, range)
    .filter((t) => t.categoryId && ids.has(t.categoryId))
    .reduce((s, t) => s + spendingDelta(t), 0);
}

/**
 * Net amount each person owes the user (positive) or the user owes them (negative),
 * from shared expenses, loans and repayments. Settlement = a `repayment` transaction.
 */
export function personBalances(txs: Transaction[]): Map<Id, number> {
  const out = new Map<Id, number>();
  const add = (id: Id, n: number) => out.set(id, (out.get(id) ?? 0) + n);
  for (const t of txs) {
    if (t.deletedAt) continue;
    if (t.type === 'expense' && t.splits) {
      if (t.paidBy === 'me') for (const s of t.splits) { if (s.personId !== 'me') add(s.personId, s.amountMinor); }
      else add(t.paidBy, -(t.splits.find((s) => s.personId === 'me')?.amountMinor ?? 0));
    } else if (t.type === 'debt' && t.counterpartyId) add(t.counterpartyId, t.debtDirection === 'lent' ? t.amountMinor : -t.amountMinor);
    else if (t.type === 'repayment' && t.counterpartyId) add(t.counterpartyId, t.repaymentDirection === 'received' ? -t.amountMinor : t.amountMinor);
  }
  return out;
}

/** Validates a transaction against ledger context. Returns every problem found; empty array = valid. */
export function validateTransaction(tx: Transaction, data: LedgerData): Issue[] {
  const issues: Issue[] = [];
  const bad = (code: IssueCode, field: string, message: string) => issues.push({ code, field, message });
  const acct = (id: Id | null) => (id ? data.accounts.find((a) => a.id === id) : undefined);

  if (!Number.isSafeInteger(tx.amountMinor) || tx.amountMinor <= 0) bad('amount_invalid', 'amount', 'Amount must be a positive whole number of minor units.');
  if (!isValidLocalDate(tx.localDate)) bad('date_invalid', 'date', 'Date is not a valid calendar date.');

  const needsOwnAccount = !(tx.type === 'expense' && tx.paidBy !== 'me');
  const from = acct(tx.accountId);
  if (needsOwnAccount) {
    if (!tx.accountId) bad('account_required', 'account', 'An account is required.');
    else if (!from) bad('account_not_found', 'account', 'Account does not exist.');
    else {
      if (from.archivedAt) bad('account_archived', 'account', 'Account is archived.');
      if (from.currency !== tx.currency) bad('currency_mismatch', 'currency', 'Currency must match the account currency.');
    }
  }

  if (isInternalMove(tx.type)) {
    const to = acct(tx.toAccountId);
    if (!tx.toAccountId) bad('to_account_required', 'toAccount', 'A destination account is required.');
    else if (!to) bad('account_not_found', 'toAccount', 'Destination account does not exist.');
    else if (to.currency !== tx.currency) bad('currency_mismatch', 'toAccount', 'Cross-currency transfers are not supported yet.');
    if (tx.accountId && tx.accountId === tx.toAccountId) bad('transfer_same_account', 'toAccount', 'Source and destination must differ.');
    if (tx.type === 'goal_contribution' && !tx.goalId) bad('goal_required', 'goal', 'A goal is required.');
  }

  if (tx.categoryId) {
    const cat = data.categories.find((c) => c.id === tx.categoryId);
    if (!cat) bad('category_not_found', 'category', 'Category does not exist.');
    else if ((tx.type === 'income' && cat.kind !== 'income') || ((tx.type === 'expense' || tx.type === 'refund') && cat.kind !== 'expense'))
      bad('category_kind_mismatch', 'category', 'Category type does not match the transaction type.');
  }

  if (tx.type === 'debt') {
    if (!tx.counterpartyId) bad('counterparty_required', 'counterparty', 'Who is this with?');
    if (!tx.debtDirection) bad('direction_required', 'direction', 'Lent or borrowed?');
  }
  if (tx.type === 'repayment') {
    if (!tx.counterpartyId) bad('counterparty_required', 'counterparty', 'Who is this with?');
    if (!tx.repaymentDirection) bad('direction_required', 'direction', 'Received or paid?');
  }
  if ((tx.type === 'debt' || tx.type === 'repayment') && tx.counterpartyId && !data.people.some((p) => p.id === tx.counterpartyId))
    bad('party_not_found', 'counterparty', 'Person does not exist.');

  if (tx.type === 'expense') {
    if (tx.paidBy !== 'me' && !tx.splits) bad('splits_required', 'splits', 'Expenses paid by someone else need a split.');
    if (tx.paidBy !== 'me' && !data.people.some((p) => p.id === tx.paidBy)) bad('party_not_found', 'paidBy', 'Person does not exist.');
    if (tx.splits) {
      const sum = tx.splits.reduce((s, x) => s + x.amountMinor, 0);
      if (tx.splits.some((s) => !Number.isSafeInteger(s.amountMinor) || s.amountMinor < 0)) bad('splits_invalid', 'splits', 'Split amounts must be whole, non-negative numbers.');
      if (sum !== tx.amountMinor) bad('splits_sum_mismatch', 'splits', 'Split amounts must add up to the total.');
      for (const s of tx.splits) if (s.personId !== 'me' && !data.people.some((p) => p.id === s.personId)) bad('party_not_found', 'splits', 'Person does not exist.');
    }
  } else if (tx.splits) bad('splits_invalid', 'splits', 'Only expenses can be split.');

  return issues;
}
