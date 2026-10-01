import { currencyInfo } from './money';
import type { Account, AuditEntry, Budget, Category, Goal, Person, Profile, RecurringRule, Transaction } from './types';

export const EXPORT_FORMAT = 'nomi-export';
export const EXPORT_VERSION = 1;

export interface ExportInput {
  profile: Profile; accounts: Account[]; categories: Category[]; people: Person[]; goals: Goal[]; recurringRules: RecurringRule[];
  budgets: Budget[]; transactions: Transaction[]; audit: AuditEntry[];
}

/**
 * Everything the user owns, as one self-describing JSON document. Nothing is left out or summarised: soft-deleted transactions and the audit
 * trail are included, and amounts stay in integer minor units so no precision is lost. Shared system categories are not the user's data, so
 * only their own categories are included (transactions refer to system categories by id).
 */
export function buildExport(input: ExportInput, now: Date) {
  return {
    format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now.toISOString(),
    note: 'Amounts are integers in the smallest unit of the currency (for BDT, poisha: 100 = ৳1). Dates are in the user\'s own timezone.',
    profile: input.profile,
    accounts: input.accounts, categories: input.categories.filter((c) => c.userId !== null), people: input.people, goals: input.goals,
    recurringRules: input.recurringRules, budgets: input.budgets, transactions: input.transactions, audit: input.audit,
  };
}

export const exportFileName = (now: Date, ext: 'json' | 'csv') => `nomi-export-${now.toISOString().slice(0, 10)}.${ext}`;

/** A spreadsheet cell that starts with = + - or @ can run as a formula when opened, so those are made inert. */
function cell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const decimal = (minor: number, currency: Transaction['currency']): string => {
  const d = currencyInfo(currency).minorUnit;
  return d === 0 ? String(minor) : (minor / 10 ** d).toFixed(d);
};

/** Live transactions for a spreadsheet: one row each, amounts in ordinary decimals, oldest first. */
export function transactionsToCsv(txs: Transaction[], accounts: Account[], categories: Category[], people: Person[] = []): string {
  const acc = new Map(accounts.map((a) => [a.id, a.name])), cat = new Map(categories.map((c) => [c.id, c.name])), ppl = new Map(people.map((p) => [p.id, p.name]));
  const head = ['Date', 'Type', 'Amount', 'Currency', 'Category', 'Merchant', 'Account', 'To account', 'Paid by', 'My share', 'Person', 'Note'];
  const rows = txs.filter((t) => !t.deletedAt).sort((a, b) => a.localDate.localeCompare(b.localDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map((t) => {
    const mine = t.splits?.find((s) => s.personId === 'me')?.amountMinor;
    return [t.localDate, t.type, decimal(t.amountMinor, t.currency), t.currency, t.categoryId ? cat.get(t.categoryId) ?? '' : '', t.merchantName, t.accountId ? acc.get(t.accountId) ?? '' : '',
      t.toAccountId ? acc.get(t.toAccountId) ?? '' : '', t.paidBy === 'me' ? 'Me' : ppl.get(t.paidBy) ?? t.paidBy, mine !== undefined ? decimal(mine, t.currency) : '',
      t.counterpartyId ? ppl.get(t.counterpartyId) ?? '' : '', t.notes].map(cell).join(',');
  });
  return [head.join(','), ...rows].join('\r\n') + '\r\n';
}
