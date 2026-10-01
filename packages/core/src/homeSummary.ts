import { addDays, endOfMonth, startOfMonth, type LocalDate } from './dates';
import { budgetStatus, type BudgetStatus } from './budgets';
import { goalSavedMinor } from './goals';
import { incomeTotal, netSpending } from './ledger';
import { upcomingObligations, type UpcomingItem } from './recurring';
import { safeToSpend, type SafeToSpend } from './safeToSpend';
import { whatChanged, type WhatChanged } from './whatChanged';
import type { Account, Budget, Category, Goal, LedgerData, Profile, RecurringRule, Transaction } from './types';

export interface LedgerSnapshot extends LedgerData {
  profile: Profile; budgets: Budget[]; recurringRules: RecurringRule[]; goals: Goal[];
}

export interface RecentItem {
  transaction: Transaction;
  title: string; categoryName: string | null; accountName: string | null;
  /** Signed effect on the user's money for display: income +, expense -, 0 for transfers. */
  direction: 'in' | 'out' | 'neutral';
}

export interface HomeSummary {
  today: LocalDate; currency: string;
  hasAccounts: boolean; hasTransactions: boolean;
  pulse: {
    availableMinor: number; spentMinor: number; incomeMinor: number; netFlowMinor: number;
    /** Overall monthly budget left, or null when no overall budget is set. */
    budgetLeftMinor: number | null;
    savedMinor: number; goalsTargetMinor: number;
    /** Comparison with the previous-months pace, only when there is enough history. */
    vsUsual: { deltaMinor: number; deltaRatio: number; direction: 'higher' | 'lower' | 'similar' } | null;
  };
  safeToSpend: SafeToSpend;
  whatChanged: WhatChanged;
  budgets: BudgetStatus[];
  upcoming: UpcomingItem[];
  recent: RecentItem[];
}

export const UPCOMING_WINDOW_DAYS = 14;
export const RECENT_COUNT = 6;

const TYPE_TITLES: Record<Transaction['type'], string> = {
  expense: 'Expense', income: 'Income', transfer: 'Transfer', refund: 'Refund', debt: 'Loan', repayment: 'Repayment',
  savings_contribution: 'Savings', goal_contribution: 'Goal contribution',
};

/**
 * Everything Home shows, computed from the ledger by the same deterministic functions the rest of the app uses.
 * The UI receives these numbers and formats them; it performs no calculation.
 */
export function buildHomeSummary(snap: LedgerSnapshot, today: LocalDate): HomeSummary {
  const txs = snap.transactions.filter((t) => !t.deletedAt);
  const month = { from: startOfMonth(today), to: today };
  const accountName = new Map(snap.accounts.map((a: Account) => [a.id, a.name]));
  const categoryName = new Map(snap.categories.map((c: Category) => [c.id, c.name]));

  const sts = safeToSpend({ accounts: snap.accounts, transactions: txs, recurringRules: snap.recurringRules, goals: snap.goals, today, bufferMinor: snap.profile.safetyBufferMinor });
  const wc = whatChanged(txs, snap.categories, today);
  const dueThisMonth = upcomingObligations(snap.recurringRules, txs, today, endOfMonth(today));
  const budgets = snap.budgets.map((b) => budgetStatus(b, txs, snap.categories, today, dueThisMonth));
  const overall = budgets.find((b) => b.budget.categoryId === null);
  const spent = netSpending(txs, month);
  const income = incomeTotal(txs, month);

  const recent: RecentItem[] = [...txs]
    .sort((a, b) => b.localDate.localeCompare(a.localDate) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, RECENT_COUNT)
    .map((t) => {
      const cat = t.categoryId ? categoryName.get(t.categoryId) ?? null : null;
      const direction = t.type === 'income' || t.type === 'refund' ? 'in' : t.type === 'expense' ? 'out' : 'neutral';
      return { transaction: t, title: t.merchantName ?? cat ?? t.notes ?? TYPE_TITLES[t.type], categoryName: cat,
        accountName: t.accountId ? accountName.get(t.accountId) ?? null : null, direction };
    });

  return {
    today, currency: snap.profile.currency,
    hasAccounts: snap.accounts.some((a) => !a.archivedAt), hasTransactions: txs.length > 0,
    pulse: {
      availableMinor: sts.liquidMinor, spentMinor: spent, incomeMinor: income, netFlowMinor: income - spent,
      budgetLeftMinor: overall ? overall.remainingMinor : null,
      savedMinor: snap.goals.reduce((s, g) => s + goalSavedMinor(g, txs), 0), goalsTargetMinor: snap.goals.reduce((s, g) => s + g.targetMinor, 0),
      vsUsual: wc.status === 'ok' ? { deltaMinor: wc.deltaMinor, deltaRatio: wc.deltaRatio, direction: wc.direction } : null,
    },
    safeToSpend: sts, whatChanged: wc, budgets,
    upcoming: upcomingObligations(snap.recurringRules, txs, today, addDays(today, UPCOMING_WINDOW_DAYS)),
    recent,
  };
}

