import { addDays, addMonths, type LocalDate } from './dates';
import type { RecurringRule, Transaction } from './types';

/**
 * Occurrence dates of a rule within [from, to]. Each date is computed from the anchor (not from the previous
 * occurrence) so month-end clamping never drifts: anchor Jan 31 -> Feb 28 -> Mar 31.
 */
export function occurrences(rule: RecurringRule, from: LocalDate, to: LocalDate): LocalDate[] {
  if (!rule.active || rule.interval < 1) return [];
  const out: LocalDate[] = [];
  for (let n = 0; n < 5000; n++) {
    const date =
      rule.frequency === 'weekly' ? addDays(rule.anchorDate, 7 * rule.interval * n)
      : rule.frequency === 'monthly' ? addMonths(rule.anchorDate, rule.interval * n)
      : addMonths(rule.anchorDate, 12 * rule.interval * n);
    if (date > to) break;
    if (rule.endDate && date > rule.endDate) break;
    if (date >= from) out.push(date);
  }
  return out;
}

export interface UpcomingItem { rule: RecurringRule; date: LocalDate; amountMinor: number }

const isPaid = (rule: RecurringRule, date: LocalDate, txs: Transaction[]) =>
  txs.some((t) => !t.deletedAt && t.recurringRuleId === rule.id && t.occurrenceDate === date);

/**
 * Unpaid expense occurrences in [from, to]. An occurrence is "paid" when a transaction links to the rule and date.
 * Occurrences before `from` (overdue and not recorded) are deliberately ignored: we cannot know if they were paid.
 */
export function upcomingObligations(rules: RecurringRule[], txs: Transaction[], from: LocalDate, to: LocalDate): UpcomingItem[] {
  return rules
    .filter((r) => r.type === 'expense')
    .flatMap((r) => occurrences(r, from, to).filter((d) => !isPaid(r, d, txs)).map((date) => ({ rule: r, date, amountMinor: r.amountMinor })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.rule.name.localeCompare(b.rule.name));
}
