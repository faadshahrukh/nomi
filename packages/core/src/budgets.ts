import { daysInMonth, endOfMonth, parseLocalDate, startOfMonth, type LocalDate } from './dates';
import { categorySubtree, netSpending, spendingInCategory } from './ledger';
import type { UpcomingItem } from './recurring';
import type { Budget, Category, Transaction } from './types';

export type BudgetState = 'on_track' | 'watch' | 'at_risk' | 'over';

export interface BudgetStatus {
  budget: Budget; spentMinor: number; remainingMinor: number; usedRatio: number;
  /** Month-end estimate: spent so far + everyday spending at the current daily pace + unpaid recurring bills still due. */
  projectedMinor: number; state: BudgetState;
}

/** Projections are noisy early in the month, so pace-based warnings need at least this many elapsed days. */
export const MIN_DAYS_FOR_PROJECTION = 7;

/**
 * Monthly budget status as of `today`.
 * Projection: bills that repeat on a schedule are paid on fixed days, so they are not extrapolated as a daily rate.
 * Everyday (non-recurring) spending is projected at its pace so far; unpaid recurring bills due later this month are added as-is.
 *  over     spent > budget
 *  at_risk  used >= 90%, or projected month-end > budget (after MIN_DAYS_FOR_PROJECTION)
 *  watch    used >= 75%, or projected > 90% of budget (after MIN_DAYS_FOR_PROJECTION)
 */
export function budgetStatus(budget: Budget, txs: Transaction[], categories: Category[], today: LocalDate, upcoming: UpcomingItem[] = []): BudgetStatus {
  const range = { from: startOfMonth(today), to: endOfMonth(today) };
  const spent = budget.categoryId
    ? spendingInCategory(txs, categories, budget.categoryId, { from: range.from, to: today })
    : netSpending(txs, { from: range.from, to: today });
  const { y, m, d } = parseLocalDate(today);
  const inScope = budget.categoryId ? categorySubtree(categories, budget.categoryId) : null;
  const scoped = (t: Transaction) => !inScope || (t.categoryId !== null && inScope.has(t.categoryId));
  const recurringSpent = txs.filter((t) => !t.deletedAt && t.type === 'expense' && t.recurringRuleId && scoped(t) && t.localDate >= range.from && t.localDate <= today)
    .reduce((s, t) => s + (t.splits ? t.splits.find((x) => x.personId === 'me')?.amountMinor ?? 0 : t.amountMinor), 0);
  const dueLater = upcoming.filter((u) => u.date <= range.to && (!inScope || (u.rule.categoryId !== null && inScope.has(u.rule.categoryId)))).reduce((s, u) => s + u.amountMinor, 0);
  const everyday = spent - recurringSpent;
  const projected = Math.round(spent + (everyday / d) * (daysInMonth(y, m) - d) + dueLater);
  const used = budget.amountMinor > 0 ? spent / budget.amountMinor : 0;
  const pace = d >= MIN_DAYS_FOR_PROJECTION;
  let state: BudgetState = 'on_track';
  if (spent > budget.amountMinor) state = 'over';
  else if (used >= 0.9 || (pace && projected > budget.amountMinor)) state = 'at_risk';
  else if (used >= 0.75 || (pace && projected > budget.amountMinor * 0.9)) state = 'watch';
  return { budget, spentMinor: spent, remainingMinor: budget.amountMinor - spent, usedRatio: used, projectedMinor: projected, state };
}
