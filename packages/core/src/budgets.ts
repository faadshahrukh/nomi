import { daysInMonth, endOfMonth, parseLocalDate, startOfMonth, type LocalDate } from './dates';
import { netSpending, spendingInCategory } from './ledger';
import type { Budget, Category, Transaction } from './types';

export type BudgetState = 'on_track' | 'watch' | 'at_risk' | 'over';

export interface BudgetStatus {
  budget: Budget; spentMinor: number; remainingMinor: number; usedRatio: number;
  /** Straight-line projection of month-end spending at the current pace. */
  projectedMinor: number; state: BudgetState;
}

/** Projections are noisy early in the month, so pace-based warnings need at least this many elapsed days. */
export const MIN_DAYS_FOR_PROJECTION = 7;

/**
 * Monthly budget status as of `today`.
 *  over     spent > budget
 *  at_risk  used >= 90%, or projected month-end > budget (after MIN_DAYS_FOR_PROJECTION)
 *  watch    used >= 75%, or projected > 90% of budget (after MIN_DAYS_FOR_PROJECTION)
 */
export function budgetStatus(budget: Budget, txs: Transaction[], categories: Category[], today: LocalDate): BudgetStatus {
  const range = { from: startOfMonth(today), to: endOfMonth(today) };
  const spent = budget.categoryId
    ? spendingInCategory(txs, categories, budget.categoryId, { from: range.from, to: today })
    : netSpending(txs, { from: range.from, to: today });
  const { y, m, d } = parseLocalDate(today);
  const projected = Math.round((spent / d) * daysInMonth(y, m));
  const used = budget.amountMinor > 0 ? spent / budget.amountMinor : 0;
  const pace = d >= MIN_DAYS_FOR_PROJECTION;
  let state: BudgetState = 'on_track';
  if (spent > budget.amountMinor) state = 'over';
  else if (used >= 0.9 || (pace && projected > budget.amountMinor)) state = 'at_risk';
  else if (used >= 0.75 || (pace && projected > budget.amountMinor * 0.9)) state = 'watch';
  return { budget, spentMinor: spent, remainingMinor: budget.amountMinor - spent, usedRatio: used, projectedMinor: projected, state };
}
