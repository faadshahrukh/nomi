import { addMonths, daysInMonth, formatLocalDate, parseLocalDate, startOfMonth, type LocalDate } from './dates';
import { netSpending, rootCategoryId, spendingByRootCategory, spendingTransactions } from './ledger';
import type { Category, Id, Transaction } from './types';

export interface WhatChangedOptions {
  baselineMonths?: number;      // how many previous months to average (default 3)
  similarRatio?: number;        // |delta|/baseline below this = "similar" (default 5%)
  /** Wait this many days into the month before comparing, so one or two days of spending is not called a trend (default 7). */
  minDayOfMonth?: number;
  minDriverMinor?: number;      // ignore category drivers smaller than this (default 500.00 in major units => 50_000 minor)
  maxDrivers?: number;          // default 3
  /** First date the user has complete tracking from. Defaults to their earliest transaction. */
  trackingStartDate?: LocalDate;
}

export interface Driver {
  categoryId: Id | null; currentMinor: number; baselineMinor: number; deltaMinor: number;
  /** Supporting transactions from the current month for this category. */
  transactionIds: Id[];
  largestTransaction: { id: Id; amountMinor: number } | null;
}

export type WhatChanged =
  | { status: 'insufficient_data'; reason: 'no_transactions' | 'early_in_month' | 'no_complete_baseline_month' }
  | {
      status: 'ok'; direction: 'higher' | 'lower' | 'similar';
      currentMinor: number; baselineMinor: number; deltaMinor: number; deltaRatio: number;
      /** The months averaged and the day-of-month the comparison is matched to. */
      baselineMonths: string[]; throughDay: number; drivers: Driver[];
    };

/**
 * Compares month-to-date spending with the average of previous months over the SAME elapsed days
 * (pace-matched), using only months that were fully tracked. Reports which categories drive the difference.
 * It waits until minDayOfMonth (default 7) so a few days of spending is not called a trend.
 * It states numbers and supporting transactions only; it never infers a behavioural reason.
 */
export function whatChanged(txs: Transaction[], categories: Category[], today: LocalDate, opts: WhatChangedOptions = {}): WhatChanged {
  const N = opts.baselineMonths ?? 3, similar = opts.similarRatio ?? 0.05, minDriver = opts.minDriverMinor ?? 50_000, maxDrivers = opts.maxDrivers ?? 3;
  const live = txs.filter((t) => !t.deletedAt);
  if (!live.length) return { status: 'insufficient_data', reason: 'no_transactions' };
  const start = opts.trackingStartDate ?? live.reduce((min, t) => (t.localDate < min ? t.localDate : min), live[0]!.localDate);

  const { y, m, d } = parseLocalDate(today);
  if (d < (opts.minDayOfMonth ?? 7)) return { status: 'insufficient_data', reason: 'early_in_month' };
  const monthStart = startOfMonth(today);
  const months: Array<{ key: string; from: LocalDate; to: LocalDate }> = [];
  for (let i = 1; i <= N; i++) {
    const from = startOfMonth(addMonths(monthStart, -i));
    if (from < start) break; // partially tracked month
    const p = parseLocalDate(from);
    months.push({ key: from.slice(0, 7), from, to: formatLocalDate(p.y, p.m, Math.min(d, daysInMonth(p.y, p.m))) });
  }
  if (!months.length) return { status: 'insufficient_data', reason: 'no_complete_baseline_month' };

  const current = netSpending(live, { from: monthStart, to: today });
  const perMonth = months.map((mo) => ({ total: netSpending(live, mo), byCat: spendingByRootCategory(live, categories, mo) }));
  const baseline = Math.round(perMonth.reduce((s, x) => s + x.total, 0) / months.length);
  const delta = current - baseline;
  const ratio = baseline > 0 ? delta / baseline : current > 0 ? 1 : 0;
  const direction = Math.abs(ratio) < similar ? 'similar' : delta > 0 ? 'higher' : 'lower';

  const curByCat = spendingByRootCategory(live, categories, { from: monthStart, to: today });
  const keys = new Set<Id | null>([...curByCat.keys(), ...perMonth.flatMap((x) => [...x.byCat.keys()])]);
  const curTxs = spendingTransactions(live, { from: monthStart, to: today });
  const drivers: Driver[] = [...keys].map((k) => {
    const cur = curByCat.get(k) ?? 0;
    const base = Math.round(perMonth.reduce((s, x) => s + (x.byCat.get(k) ?? 0), 0) / months.length);
    const ofCat = curTxs.filter((t) => rootCategoryId(categories, t.categoryId) === k);
    const largest = ofCat.filter((t) => t.type === 'expense').sort((a, b) => b.amountMinor - a.amountMinor)[0];
    return { categoryId: k, currentMinor: cur, baselineMinor: base, deltaMinor: cur - base, transactionIds: ofCat.map((t) => t.id),
      largestTransaction: largest ? { id: largest.id, amountMinor: largest.amountMinor } : null };
  })
    .filter((x) => direction !== 'similar' && Math.sign(x.deltaMinor) === Math.sign(delta) && Math.abs(x.deltaMinor) >= minDriver)
    .sort((a, b) => Math.abs(b.deltaMinor) - Math.abs(a.deltaMinor))
    .slice(0, maxDrivers);

  return { status: 'ok', direction, currentMinor: current, baselineMinor: baseline, deltaMinor: delta, deltaRatio: ratio,
    baselineMonths: months.map((x) => x.key), throughDay: d, drivers };
}
