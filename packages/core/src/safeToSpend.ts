import { diffDays, endOfMonth, startOfMonth, type LocalDate } from './dates';
import { accountBalance } from './ledger';
import { upcomingObligations, type UpcomingItem } from './recurring';
import type { Account, Goal, RecurringRule, Transaction } from './types';

export interface SafeToSpendInput {
  accounts: Account[]; transactions: Transaction[]; recurringRules: RecurringRule[]; goals: Goal[];
  today: LocalDate; bufferMinor: number;
  /** End of the planning period. Defaults to the last day of the current month. */
  periodEnd?: LocalDate;
}

export interface GoalReserve { goalId: string; name: string; requiredMinor: number; contributedMinor: number; reservedMinor: number }

export interface SafeToSpend {
  liquidMinor: number; upcomingMinor: number; reservedGoalsMinor: number; bufferMinor: number;
  /** liquid - upcoming - reserved - buffer. May be negative. */
  availableMinor: number;
  /** Days left in the period, counting today. */
  daysRemaining: number;
  /** max(0, available) spread evenly over the remaining days. An estimate, not a guarantee. */
  perDayMinor: number;
  upcoming: UpcomingItem[]; goalReserves: GoalReserve[]; periodEnd: LocalDate;
}

/** Whole months from `from` to `to`, minimum 1 (the current month counts). */
function monthsLeft(from: LocalDate, to: LocalDate): number {
  const m = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
  return Math.max(1, m + (to.slice(8) >= from.slice(8) ? 1 : 0));
}

/**
 * Safe to Spend (V1, rules-based):
 *   liquid balance (accounts flagged includeInLiquid)
 * - unpaid recurring expenses due from today through period end
 * - goal money still to be set aside this month
 * - safety buffer
 * Per-day figure = max(0, available) / days remaining.
 * Goal reserve per goal = max(0, required this month - already contributed this month), where required is the
 * goal's fixed monthly contribution, else (target - saved) spread over months until the target date, else 0.
 */
export function safeToSpend(input: SafeToSpendInput): SafeToSpend {
  const { today } = input;
  const periodEnd = input.periodEnd ?? endOfMonth(today);
  const liquid = input.accounts.filter((a) => a.includeInLiquid && !a.archivedAt)
    .reduce((s, a) => s + accountBalance(a, input.transactions), 0);

  const upcoming = upcomingObligations(input.recurringRules, input.transactions, today, periodEnd);
  const upcomingMinor = upcoming.reduce((s, u) => s + u.amountMinor, 0);

  const monthStart = startOfMonth(today);
  const goalReserves: GoalReserve[] = input.goals.map((g) => {
    const contribs = input.transactions.filter((t) => !t.deletedAt && t.type === 'goal_contribution' && t.goalId === g.id);
    const saved = g.openingSavedMinor + contribs.reduce((s, t) => s + t.amountMinor, 0);
    const thisMonth = contribs.filter((t) => t.localDate >= monthStart && t.localDate <= endOfMonth(today)).reduce((s, t) => s + t.amountMinor, 0);
    const remaining = Math.max(0, g.targetMinor - saved);
    const required = remaining === 0 ? 0
      : g.monthlyContributionMinor != null ? g.monthlyContributionMinor
      : g.targetDate ? Math.ceil(remaining / monthsLeft(today, g.targetDate)) : 0;
    return { goalId: g.id, name: g.name, requiredMinor: required, contributedMinor: thisMonth, reservedMinor: Math.max(0, required - thisMonth) };
  });
  const reserved = goalReserves.reduce((s, g) => s + g.reservedMinor, 0);

  const available = liquid - upcomingMinor - reserved - input.bufferMinor;
  const daysRemaining = diffDays(today, periodEnd) + 1;
  return {
    liquidMinor: liquid, upcomingMinor, reservedGoalsMinor: reserved, bufferMinor: input.bufferMinor,
    availableMinor: available, daysRemaining, perDayMinor: Math.floor(Math.max(0, available) / daysRemaining),
    upcoming, goalReserves, periodEnd,
  };
}
