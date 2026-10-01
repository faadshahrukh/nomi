import { addDays, addMonths, endOfMonth, startOfMonth, type LocalDate } from './dates';
import { budgetStatus, type BudgetStatus } from './budgets';
import { goalSavedMinor } from './goals';
import { accountBalance, incomeTotal, liquidBalanceOn, netSpending } from './ledger';
import { occurrences, upcomingObligations, type UpcomingItem } from './recurring';
import { safeToSpend, type SafeToSpend } from './safeToSpend';
import { whatChanged, type WhatChanged } from './whatChanged';
import type { Account, Budget, Category, Goal, LedgerData, Profile, RecurringRule, Transaction } from './types';

export interface LedgerSnapshot extends LedgerData {
  profile: Profile; budgets: Budget[]; recurringRules: RecurringRule[]; goals: Goal[];
}

export interface RecentItem {
  transaction: Transaction;
  title: string; categoryName: string | null; accountName: string | null; toAccountName: string | null;
  /** Signed effect on the user's money for display: income +, expense -, 0 for transfers. */
  direction: 'in' | 'out' | 'neutral';
}

export interface Signal {
  categoryId: string | null; ratio: number; currentMinor: number; baselineMinor: number; deltaMinor: number; transactionIds: string[];
}

/** A category must run at least this far above its usual pace to be called out. */
export const SIGNAL_MIN_RATIO = 0.1;

export interface GoalProgress {
  goal: Goal; savedMinor: number; ratio: number;
  /** Still to set aside this month for this goal (see Safe to Spend). */
  reservedThisMonthMinor: number;
}

export interface RecurringSummary { rule: RecurringRule; nextDate: LocalDate | null }

export type TransactionFilter = 'all' | 'expenses' | 'income' | 'transfers' | 'recurring';

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
    /** Available balance now vs the same day one month ago. Null until a full month of history exists, or if that balance was not positive. */
    balanceChange: { previousMinor: number; ratio: number } | null;
  };
  /**
   * The one thing worth pointing out today: the largest category running clearly above its usual pace.
   * Null when nothing qualifies, so the card simply does not appear (no filler, no alerts for the sake of it).
   */
  signal: Signal | null;
  safeToSpend: SafeToSpend;
  whatChanged: WhatChanged;
  budgets: BudgetStatus[];
  upcoming: UpcomingItem[];
  recent: RecentItem[];
  goals: GoalProgress[];
  recurring: RecurringSummary[];
  /** Every live account with its current balance, for the Accounts screen. */
  accountBalances: Array<{ account: Account; balanceMinor: number }>;
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

  const sts = safeToSpend({ accounts: snap.accounts, transactions: txs, recurringRules: snap.recurringRules, goals: snap.goals, today, bufferMinor: snap.profile.safetyBufferMinor });
  const wc = whatChanged(txs, snap.categories, today);
  const dueThisMonth = upcomingObligations(snap.recurringRules, txs, today, endOfMonth(today));
  const budgets = snap.budgets.map((b) => budgetStatus(b, txs, snap.categories, today, dueThisMonth));
  const overall = budgets.find((b) => b.budget.categoryId === null);
  const spent = netSpending(txs, month);
  const income = incomeTotal(txs, month);

  const recent = describeTransactions(txs, snap.accounts, snap.categories).slice(0, RECENT_COUNT);

  return {
    today, currency: snap.profile.currency,
    hasAccounts: snap.accounts.some((a) => !a.archivedAt), hasTransactions: txs.length > 0,
    pulse: {
      availableMinor: sts.liquidMinor, spentMinor: spent, incomeMinor: income, netFlowMinor: income - spent,
      budgetLeftMinor: overall ? overall.remainingMinor : null,
      savedMinor: snap.goals.reduce((s, g) => s + goalSavedMinor(g, txs), 0), goalsTargetMinor: snap.goals.reduce((s, g) => s + g.targetMinor, 0),
      vsUsual: wc.status === 'ok' ? { deltaMinor: wc.deltaMinor, deltaRatio: wc.deltaRatio, direction: wc.direction } : null,
      balanceChange: balanceChange(snap, txs, today),
    },
    signal: signalFrom(wc),
    safeToSpend: sts, whatChanged: wc, budgets,
    upcoming: upcomingObligations(snap.recurringRules, txs, today, addDays(today, UPCOMING_WINDOW_DAYS)),
    recent,
    goals: snap.goals.map((g) => {
      const saved = goalSavedMinor(g, txs);
      return { goal: g, savedMinor: saved, ratio: g.targetMinor > 0 ? Math.min(1, saved / g.targetMinor) : 0,
        reservedThisMonthMinor: sts.goalReserves.find((r) => r.goalId === g.id)?.reservedMinor ?? 0 };
    }),
    accountBalances: snap.accounts.filter((a) => !a.archivedAt).map((a) => ({ account: a, balanceMinor: accountBalance(a, txs) })),
    recurring: snap.recurringRules.filter((r) => r.active).map((r) => ({ rule: r, nextDate: occurrences(r, today, addDays(today, 400))[0] ?? null }))
      .sort((a, b) => (a.nextDate ?? '9999').localeCompare(b.nextDate ?? '9999')),
  };
}

/** Newest first. Resolves names so screens can render a ledger line without looking anything up. */
export function describeTransactions(txs: Transaction[], accounts: Account[], categories: Category[]): RecentItem[] {
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  return txs.filter((t) => !t.deletedAt)
    .sort((a, b) => b.localDate.localeCompare(a.localDate) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .map((t) => {
      const cat = t.categoryId ? categoryName.get(t.categoryId) ?? null : null;
      const direction = t.type === 'income' || t.type === 'refund' ? 'in' : t.type === 'expense' ? 'out' : 'neutral';
      return { transaction: t, title: t.merchantName ?? cat ?? t.notes ?? TYPE_TITLES[t.type], categoryName: cat,
        accountName: t.accountId ? accountName.get(t.accountId) ?? null : null,
        toAccountName: t.toAccountId ? accountName.get(t.toAccountId) ?? null : null, direction };
    });
}

/** Ledger tabs. "expenses" includes shared and refunded purchases; "transfers" includes savings and goal moves. */
export function filterTransactions(items: RecentItem[], filter: TransactionFilter): RecentItem[] {
  const keep = (t: Transaction): boolean => {
    switch (filter) {
      case 'all': return true;
      case 'expenses': return t.type === 'expense' || t.type === 'refund';
      case 'income': return t.type === 'income';
      case 'transfers': return t.type === 'transfer' || t.type === 'savings_contribution' || t.type === 'goal_contribution';
      case 'recurring': return t.recurringRuleId !== null;
    }
  };
  return items.filter((i) => keep(i.transaction));
}


function balanceChange(snap: LedgerSnapshot, txs: Transaction[], today: LocalDate): { previousMinor: number; ratio: number } | null {
  if (!txs.length) return null;
  const start = txs.reduce((min, t) => (t.localDate < min ? t.localDate : min), txs[0]!.localDate);
  const prevDate = addMonths(today, -1);
  if (prevDate < start) return null; // not tracked back far enough for a fair comparison
  const previous = liquidBalanceOn({ accounts: snap.accounts, transactions: txs }, prevDate);
  if (previous <= 0) return null;
  const now = liquidBalanceOn({ accounts: snap.accounts, transactions: txs }, today);
  return { previousMinor: previous, ratio: (now - previous) / previous };
}

function signalFrom(wc: WhatChanged): Signal | null {
  if (wc.status !== 'ok' || wc.direction !== 'higher') return null;
  const d = wc.drivers.find((x) => x.baselineMinor > 0 && x.deltaMinor / x.baselineMinor >= SIGNAL_MIN_RATIO);
  return d ? { categoryId: d.categoryId, ratio: d.deltaMinor / d.baselineMinor, currentMinor: d.currentMinor, baselineMinor: d.baselineMinor, deltaMinor: d.deltaMinor, transactionIds: d.transactionIds } : null;
}
