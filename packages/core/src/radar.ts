import { addDays, diffDays, monthKey, type LocalDate } from './dates';
import { rootCategoryId } from './ledger';
import { formatMoney, roundToWhole } from './money';
import { findPossibleDuplicate } from './draft';
import type { HomeSummary, LedgerSnapshot } from './homeSummary';
import { overdueOccurrences } from './recurringInput';
import type { Id } from './types';

export type RadarKind = 'bill_overdue' | 'bill_due_soon' | 'cash_short' | 'budget_over' | 'budget_at_risk' | 'spending_pace' | 'possible_duplicate' | 'large_expense';
export type RadarSeverity = 'urgent' | 'attention' | 'info';

/** Where tapping a signal goes. Navigation is the app's job; the core only says what the signal is about. */
export type RadarTarget =
  | { screen: 'planning'; section: 'Budgets' | 'Recurring' }
  | { screen: 'safe_to_spend' }
  | { screen: 'transaction'; id: Id }
  | { screen: 'transactions'; categoryId: Id };

export interface RadarSignal {
  /** Stable and scoped to a period or a specific item, so a dismissed signal stays dismissed but a new month or a new item can raise it again. */
  key: string; kind: RadarKind; severity: RadarSeverity; title: string; detail: string; target: RadarTarget;
}

/** Radar is a short list, not a feed. More than this is noise, and noise gets ignored. */
export const RADAR_MAX = 5;
export const BILL_SOON_DAYS = 3;
const LARGE_FACTOR = 3, LARGE_MIN_SAMPLES = 5, LARGE_LOOKBACK_DAYS = 90, RECENT_DAYS = 3;
const ORDER: Record<RadarSeverity, number> = { urgent: 0, attention: 1, info: 2 };

const when = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);
const ago = (days: number) => (days === 1 ? 'yesterday' : `${days} days ago`);

/**
 * Deterministic signals about things that need attention, worked out from the same figures as the rest of the app.
 * Nothing here guesses a reason or uses AI. Each fact has a stable key; dismissed keys are left out; one subject never
 * produces two signals (a category over budget is not also reported as "spending is up"); the list is capped and
 * the most urgent come first.
 */
export function buildRadar(snap: LedgerSnapshot, summary: HomeSummary, today: LocalDate, dismissed: ReadonlySet<string> | readonly string[] = []): RadarSignal[] {
  const skip = dismissed instanceof Set ? dismissed : new Set(dismissed);
  const c = summary.currency, month = monthKey(today);
  const money = (m: number) => formatMoney(roundToWhole(Math.abs(m), c), c);
  const out: Array<RadarSignal & { sort: string }> = [];
  const push = (s: RadarSignal, sort: string) => { if (!skip.has(s.key)) out.push({ ...s, sort }); };
  const txs = snap.transactions.filter((t) => !t.deletedAt);
  const catName = (id: Id | null) => (id ? snap.categories.find((x) => x.id === id)?.name ?? 'This category' : 'Uncategorised');

  // 1. bills that were due and not recorded, or are due very soon
  for (const o of overdueOccurrences(snap.recurringRules.filter((r) => r.type === 'expense'), txs, today)) {
    const d = diffDays(o.date, today);
    push({ key: `bill_overdue:${o.rule.id}:${o.date}`, kind: 'bill_overdue', severity: 'urgent', title: `${o.rule.name} was due ${ago(d)}`,
      detail: `${money(o.rule.amountMinor)}. If you have paid it, mark it paid so your numbers stay right.`, target: { screen: 'planning', section: 'Recurring' } }, `0${o.date}`);
  }
  for (const u of summary.upcoming) {
    const d = diffDays(today, u.date);
    if (d > BILL_SOON_DAYS) continue;
    push({ key: `bill_due:${u.rule.id}:${u.date}`, kind: 'bill_due_soon', severity: d <= 1 ? 'attention' : 'info', title: `${u.rule.name} is due ${when(d)}`,
      detail: `${money(u.amountMinor)} is coming out of ${snap.accounts.find((a) => a.id === u.rule.accountId)?.name ?? 'your account'}.`, target: { screen: 'planning', section: 'Recurring' } }, `1${u.date}`);
  }

  // 2. what is available has gone negative
  const sts = summary.safeToSpend;
  if (summary.hasAccounts && sts.availableMinor < 0) {
    push({ key: `cash_short:${month}`, kind: 'cash_short', severity: 'urgent', title: 'Your plans come to more than you have',
      detail: `Bills and goals this month are ${money(sts.availableMinor)} more than your available balance.`, target: { screen: 'safe_to_spend' } }, '0cash');
  }

  // 3. budgets
  const budgetCategories = new Set<Id | null>();
  for (const b of summary.budgets) {
    if (b.state !== 'over' && b.state !== 'at_risk') continue;
    const name = b.budget.categoryId ? catName(b.budget.categoryId) : 'Your monthly budget';
    budgetCategories.add(b.budget.categoryId ? rootCategoryId(snap.categories, b.budget.categoryId) : null);
    const over = b.state === 'over';
    push({ key: `budget:${b.budget.id}:${month}`, kind: over ? 'budget_over' : 'budget_at_risk', severity: over ? 'urgent' : 'attention',
      title: over ? `${name} is over budget` : `${name} is on track to go over`,
      detail: over ? `${money(b.remainingMinor)} over the ${money(b.budget.amountMinor)} budget.` : `At this pace it reaches about ${money(b.projectedMinor)} of ${money(b.budget.amountMinor)}.`,
      target: { screen: 'planning', section: 'Budgets' } }, `${over ? 0 : 1}${name}`);
  }

  // 4. spending running above the usual pace, unless a budget already says it
  const sig = summary.signal;
  if (sig && !budgetCategories.has(sig.categoryId)) {
    push({ key: `pace:${sig.categoryId ?? 'none'}:${month}`, kind: 'spending_pace', severity: 'info', title: `${catName(sig.categoryId)} is higher than usual`,
      detail: `${money(sig.deltaMinor)} more than your usual by this point in the month.`,
      target: sig.categoryId ? { screen: 'transactions', categoryId: sig.categoryId } : { screen: 'planning', section: 'Budgets' } }, '2pace');
  }

  // 5. recent entries that look wrong: the same thing twice, or a much bigger amount than usual
  const recentFrom = addDays(today, -(RECENT_DAYS - 1));
  const recent = txs.filter((t) => t.localDate >= recentFrom && t.localDate <= today);
  const seen = new Set<string>();
  for (const t of recent) {
    if (t.recurringRuleId) continue;
    const dup = findPossibleDuplicate({ ...t }, txs.filter((x) => x.id !== t.id && x.createdAt <= t.createdAt));
    if (dup) {
      const pair = [dup.id, t.id].sort().join(':');
      if (seen.has(pair)) continue;
      seen.add(pair);
      push({ key: `dup:${pair}`, kind: 'possible_duplicate', severity: 'info', title: 'This looks like a duplicate',
        detail: `${t.merchantName ?? 'Two entries'} for ${money(t.amountMinor)} was recorded twice on the same day.`, target: { screen: 'transaction', id: t.id } }, `3${t.createdAt}`);
    }
  }
  const lookFrom = addDays(today, -LARGE_LOOKBACK_DAYS);
  for (const t of recent) {
    if (t.type !== 'expense' || t.recurringRuleId || !t.categoryId) continue;
    const root = rootCategoryId(snap.categories, t.categoryId);
    const peers = txs.filter((x) => x.type === 'expense' && !x.recurringRuleId && x.id !== t.id && x.localDate < recentFrom && x.localDate >= lookFrom && rootCategoryId(snap.categories, x.categoryId) === root).map((x) => x.amountMinor).sort((a, b) => a - b);
    if (peers.length < LARGE_MIN_SAMPLES) continue;
    const median = peers[Math.floor(peers.length / 2)]!;
    if (t.amountMinor >= LARGE_FACTOR * median && t.amountMinor - median >= 50_000) {
      push({ key: `large:${t.id}`, kind: 'large_expense', severity: 'info', title: `${t.merchantName ?? catName(t.categoryId)} was a large one`,
        detail: `${money(t.amountMinor)}, against a usual ${money(median)} for ${catName(root)}.`, target: { screen: 'transaction', id: t.id } }, `4${t.createdAt}`);
    }
  }

  const unique = new Map<string, (typeof out)[number]>();
  for (const s of out) if (!unique.has(s.key)) unique.set(s.key, s);
  return [...unique.values()].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.sort.localeCompare(b.sort) || a.key.localeCompare(b.key))
    .slice(0, RADAR_MAX).map(({ sort: _s, ...s }) => s);
}

