import { addDays, monthKey, type LocalDate } from './dates';
import { fromBanglaDigits } from './money';
import { filterTransactions, type RecentItem, type TransactionFilter } from './homeSummary';
import type { Id } from './types';

export type TransactionPeriod = 'all' | 'this_month' | 'last_30_days';

export interface TransactionQuery {
  filter?: TransactionFilter; text?: string; accountId?: Id | null; categoryId?: Id | null; period?: TransactionPeriod;
}

const TYPE_WORDS: Record<string, string> = {
  expense: 'expense spending', income: 'income', transfer: 'transfer', refund: 'refund', debt: 'loan lent borrowed', repayment: 'repayment',
  savings_contribution: 'savings', goal_contribution: 'goal',
};

const norm = (s: string): string => fromBanglaDigits(s).toLowerCase().replace(/[,৳$€£₹]/g, '').trim();

/** The amounts a person might type for a transaction: whole ("1200") and with decimals ("1200.5"), for the total and their share. */
function amountForms(minor: number): string[] {
  const whole = Math.floor(minor / 100);
  return minor % 100 === 0 ? [String(whole)] : [(minor / 100).toFixed(2), String(minor / 100)];
}

/**
 * Words match names, merchants, notes and types; a number matches an amount exactly (so "250" finds ৳250, not ৳2,500).
 * Every word must match (AND), so "uber 250" narrows rather than widens. Bangla digits and commas are understood.
 */
export function matchesText(item: RecentItem, text: string): boolean {
  const words = norm(text).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const t = item.transaction;
  const hay = norm([item.title, t.merchantName, t.notes, item.categoryName, item.accountName, item.toAccountName, TYPE_WORDS[t.type]].filter(Boolean).join(' '));
  const mine = t.splits?.find((s) => s.personId === 'me')?.amountMinor;
  const amounts = new Set([...amountForms(t.amountMinor), ...(mine !== undefined ? amountForms(mine) : [])]);
  return words.every((w) => (/^\d+(\.\d+)?$/.test(w) ? amounts.has(w) || hay.includes(w) : hay.includes(w)));
}

/** Search, type filter, account, category and period together. Input order (newest first) is preserved. */
export function queryTransactions(items: RecentItem[], q: TransactionQuery, today: LocalDate): RecentItem[] {
  let out = filterTransactions(items, q.filter ?? 'all');
  if (q.accountId) out = out.filter((i) => i.transaction.accountId === q.accountId || i.transaction.toAccountId === q.accountId);
  if (q.categoryId) out = out.filter((i) => i.transaction.categoryId === q.categoryId);
  if (q.period === 'this_month') out = out.filter((i) => monthKey(i.transaction.localDate) === monthKey(today));
  if (q.period === 'last_30_days') { const from = addDays(today, -29); out = out.filter((i) => i.transaction.localDate >= from && i.transaction.localDate <= today); }
  if (q.text?.trim()) out = out.filter((i) => matchesText(i, q.text!));
  return out;
}

/** How many of the optional filters (not the search words or the type tab) are narrowing the list. */
export const activeFilterCount = (q: TransactionQuery): number => (q.accountId ? 1 : 0) + (q.categoryId ? 1 : 0) + (q.period && q.period !== 'all' ? 1 : 0);
