import { addDays, isValidLocalDate, type LocalDate } from './dates';
import { parseBudgetAmount } from './budgetInput';
import type { CurrencyCode } from './money';
import { occurrences } from './recurring';
import type { TransactionInput } from './transactionService';
import type { Account, Category, Id, RecurringRule, Transaction } from './types';

export type RecurringIssue = 'name_required' | 'name_too_long' | 'amount_invalid' | 'account_required' | 'account_not_found' | 'category_not_found' | 'date_invalid' | 'end_before_start' | 'interval_invalid';

export interface RecurringInput {
  name: string; type: 'expense' | 'income'; amountText: string; accountId: Id | null; categoryId: Id | null;
  frequency: RecurringRule['frequency']; interval: number; anchorDate: string; endDate: string | null; isBill: boolean;
}

export const RECURRING_ISSUE_MESSAGES: Record<RecurringIssue, string> = {
  name_required: 'Give it a name, like "Internet".',
  name_too_long: 'Use a shorter name (80 characters at most).',
  amount_invalid: 'Enter the amount as a number above zero, like 1200.',
  account_required: 'Choose the account it is paid from.',
  account_not_found: 'That account is not available.',
  category_not_found: 'That category is not available.',
  date_invalid: 'Enter the first due date as a real date, like 2025-04-05.',
  end_before_start: 'The end date has to be after the first due date.',
  interval_invalid: 'Repeat every 1 to 99.',
};

export function validateRecurringInput(i: RecurringInput, accounts: Account[], categories: Category[], currency: CurrencyCode): { issues: RecurringIssue[]; amountMinor: number | null } {
  const issues: RecurringIssue[] = [];
  const name = i.name.trim();
  if (!name) issues.push('name_required'); else if (name.length > 80) issues.push('name_too_long');
  const amountMinor = parseBudgetAmount(i.amountText, currency);
  if (amountMinor === null) issues.push('amount_invalid');
  if (!i.accountId) issues.push('account_required'); else if (!accounts.some((a) => a.id === i.accountId && !a.archivedAt)) issues.push('account_not_found');
  if (i.categoryId && !categories.some((c) => c.id === i.categoryId && !c.archivedAt && c.kind === i.type)) issues.push('category_not_found');
  if (!isValidLocalDate(i.anchorDate)) issues.push('date_invalid');
  else if (i.endDate && (!isValidLocalDate(i.endDate) || i.endDate < i.anchorDate)) issues.push(isValidLocalDate(i.endDate) ? 'end_before_start' : 'date_invalid');
  if (!Number.isInteger(i.interval) || i.interval < 1 || i.interval > 99) issues.push('interval_invalid');
  return { issues, amountMinor };
}

/** Editing keeps the id and the active flag; creating makes a new active rule. */
export function buildRecurringRule(userId: Id, id: Id, i: RecurringInput, amountMinor: number, currency: CurrencyCode, existing?: RecurringRule | null): RecurringRule {
  return {
    id: existing?.id ?? id, userId, name: i.name.trim(), type: i.type, amountMinor, currency, accountId: i.accountId!, categoryId: i.categoryId,
    frequency: i.frequency, interval: i.interval, anchorDate: i.anchorDate, endDate: i.endDate || null, isBill: i.isBill, active: existing?.active ?? true,
  };
}

const isPaid = (rule: RecurringRule, date: LocalDate, txs: Transaction[]) => txs.some((t) => !t.deletedAt && t.recurringRuleId === rule.id && t.occurrenceDate === date);

/** The first unpaid occurrence on or after today, or null when the rule is paused, ended or all paid. */
export function nextDue(rule: RecurringRule, txs: Transaction[], from: LocalDate, horizonDays = 800): LocalDate | null {
  const to = addDays(from, horizonDays);
  return occurrences(rule, from, to).find((d) => !isPaid(rule, d, txs)) ?? null;
}

/** Unpaid occurrences in the last `lookbackDays` days. Older ones are not flagged: after a couple of weeks we cannot tell whether it was just never recorded. */
export function overdueOccurrences(rules: RecurringRule[], txs: Transaction[], today: LocalDate, lookbackDays = 14): Array<{ rule: RecurringRule; date: LocalDate }> {
  const from = addDays(today, -lookbackDays), to = addDays(today, -1);
  return rules.flatMap((r) => occurrences(r, from, to).filter((d) => !isPaid(r, d, txs)).map((date) => ({ rule: r, date })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.rule.name.localeCompare(b.rule.name));
}

/**
 * The transaction recorded when the user says "paid". It is dated today (when it was really paid) but linked to the occurrence it settles,
 * so the bill stops counting as upcoming and the same occurrence cannot be recorded twice.
 */
export function payOccurrence(rule: RecurringRule, occurrenceDate: LocalDate, today: LocalDate): TransactionInput {
  return {
    type: rule.type, amountMinor: rule.amountMinor, currency: rule.currency, localDate: today, source: 'manual', accountId: rule.accountId,
    categoryId: rule.categoryId, merchantName: rule.name, recurringRuleId: rule.id, occurrenceDate,
  };
}
