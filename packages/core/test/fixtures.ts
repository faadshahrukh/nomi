import { InMemoryLedgerRepository, TransactionService, type Account, type Category, type Transaction, type TransactionInput } from '../src';

export const USER = 'u1';
export const OTHER = 'u2';

const acct = (id: string, name: string, type: Account['type'], opening: number, aliases: string[] = [], liquid = true): Account => ({
  id, userId: USER, name, type, currency: 'BDT', aliases, openingBalanceMinor: opening, includeInLiquid: liquid, archivedAt: null,
});

export const accounts: Account[] = [
  acct('cash', 'Cash', 'cash', 500_000),
  acct('bank', 'City Bank', 'bank', 10_000_000, ['bank']),
  acct('bkash', 'bKash', 'mobile_wallet', 200_000, ['bkash', 'বিকাশ']),
  acct('sav', 'Savings', 'savings', 0, [], false),
];

const cat = (id: string, name: string, parentId: string | null, kind: Category['kind'] = 'expense'): Category => ({ id, userId: null, parentId, name, kind, archivedAt: null });
export const categories: Category[] = [
  cat('food', 'Food', null), cat('groceries', 'Groceries', 'food'), cat('dining', 'Dining', 'food'),
  cat('transport', 'Transport', null), cat('rideshare', 'Ride share', 'transport'),
  cat('bills', 'Bills', null), cat('electricity', 'Electricity', 'bills'),
  cat('shopping', 'Shopping', null), cat('other', 'Other', null),
  cat('salary', 'Salary', null, 'income'),
];

export function setup(now = '2025-03-15T08:00:00Z') {
  const repo = new InMemoryLedgerRepository();
  repo.accounts = accounts.map((a) => ({ ...a }));
  repo.categories = categories.map((c) => ({ ...c }));
  repo.people = [{ id: 'rahim', userId: USER, name: 'Rahim' }, { id: 'karim', userId: USER, name: 'Karim' }];
  let n = 0;
  const svc = new TransactionService(repo, { now: () => new Date(now), newId: () => `id${++n}`, timezone: 'Asia/Dhaka' });
  return { repo, svc };
}

export const expense = (amountMinor: number, localDate: string, over: Partial<TransactionInput> = {}): TransactionInput =>
  ({ type: 'expense', amountMinor, currency: 'BDT', localDate, source: 'manual', accountId: 'cash', categoryId: 'other', ...over });

/** Builds a bare Transaction without going through the service (for pure-function tests). */
let seq = 0;
export function tx(over: Partial<Transaction> & Pick<Transaction, 'type' | 'amountMinor' | 'localDate'>): Transaction {
  return { id: `t${++seq}`, userId: USER, currency: 'BDT', categoryId: null, merchantName: null, accountId: 'cash', toAccountId: null,
    localTime: null, notes: null, paidBy: 'me', splits: null, counterpartyId: null, debtDirection: null, repaymentDirection: null,
    goalId: null, recurringRuleId: null, occurrenceDate: null, source: 'manual', aiConfidence: null, rawInput: null,
    createdAt: '', updatedAt: '', deletedAt: null, version: 1, ...over };
}
