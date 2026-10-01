import type { RecentItem } from '@nomi/core';

export interface DaySection { date: string; data: RecentItem[] }

/** Groups an already-sorted list into consecutive same-day sections. */
export function groupByDay(items: RecentItem[]): DaySection[] {
  const out: DaySection[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.date === it.transaction.localDate) last.data.push(it);
    else out.push({ date: it.transaction.localDate, data: [it] });
  }
  return out;
}
