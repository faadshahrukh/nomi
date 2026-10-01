import { diffDays, parseLocalDate, type LocalDate } from '@nomi/core';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "12 Mar" (adds the year when it is not the current one). */
export function shortDate(date: LocalDate, today: LocalDate): string {
  const { y, m, d } = parseLocalDate(date);
  return `${d} ${MONTHS[m - 1]}${y !== parseLocalDate(today).y ? ` ${y}` : ''}`;
}

/** "Today", "Yesterday", or a short date. For past activity. */
export function pastDayLabel(date: LocalDate, today: LocalDate): string {
  const n = diffDays(date, today);
  return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : shortDate(date, today);
}

/** "Today", "Tomorrow", "In 5 days · 18 Mar". For upcoming items. */
export function upcomingLabel(date: LocalDate, today: LocalDate): string {
  const n = diffDays(today, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `In ${n} days · ${shortDate(date, today)}`;
}

/** "Dec–Feb" from month keys like ["2025-02","2025-01","2024-12"] (any order). */
export function monthRangeLabel(keys: string[]): string {
  const sorted = [...keys].sort();
  const name = (k: string) => MONTHS[Number(k.slice(5, 7)) - 1]!;
  return sorted.length === 1 ? MONTHS_LONG[Number(sorted[0]!.slice(5, 7)) - 1]! : `${name(sorted[0]!)}–${name(sorted[sorted.length - 1]!)}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Mon 10 Mar" for date pickers. */
export function weekdayDate(date: LocalDate, today: LocalDate): string {
  const { y, m, d } = parseLocalDate(date);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${shortDate(date, today)}`;
}
