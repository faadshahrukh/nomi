/**
 * Calendar-date helpers. Transactions are bucketed by `LocalDate` ("YYYY-MM-DD") in the
 * user's timezone, never by UTC instants, so a 11pm purchase never lands in the wrong day or month.
 */
export type LocalDate = string;

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidLocalDate(s: string): boolean {
  const mt = RE.exec(s);
  if (!mt) return false;
  const [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function parseLocalDate(s: LocalDate): { y: number; m: number; d: number } {
  if (!isValidLocalDate(s)) throw new RangeError(`Invalid local date: ${s}`);
  const mt = RE.exec(s)!;
  return { y: Number(mt[1]), m: Number(mt[2]), d: Number(mt[3]) };
}

export function formatLocalDate(y: number, m: number, d: number): LocalDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function toUtcMs(s: LocalDate): number {
  const { y, m, d } = parseLocalDate(s);
  return Date.UTC(y, m - 1, d);
}

export function addDays(s: LocalDate, n: number): LocalDate {
  const dt = new Date(toUtcMs(s) + n * 86_400_000);
  return formatLocalDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Adds calendar months, clamping the day to the target month's length (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(s: LocalDate, n: number): LocalDate {
  const { y, m, d } = parseLocalDate(s);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return formatLocalDate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** Whole days from a to b (b - a). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

export const compareDates = (a: LocalDate, b: LocalDate): number => (a < b ? -1 : a > b ? 1 : 0);

export function startOfMonth(s: LocalDate): LocalDate {
  const { y, m } = parseLocalDate(s);
  return formatLocalDate(y, m, 1);
}

export function endOfMonth(s: LocalDate): LocalDate {
  const { y, m } = parseLocalDate(s);
  return formatLocalDate(y, m, daysInMonth(y, m));
}

export const monthKey = (s: LocalDate): string => s.slice(0, 7);

export interface DateRange { from: LocalDate; to: LocalDate } // inclusive both ends

export const inRange = (s: LocalDate, r: DateRange): boolean => s >= r.from && s <= r.to;

/** Today's calendar date in an IANA timezone, e.g. todayIn('Asia/Dhaka', new Date()). */
export function todayIn(timeZone: string, now: Date): LocalDate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Relative date references produced by the AI layer. The model never computes dates;
 * it names the reference and this function resolves it against the user's "today".
 */
export type DateRef =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'days_ago'; n: number }
  | { kind: 'absolute'; date: string }
  | { kind: 'unspecified' };

export function resolveDateRef(ref: DateRef, today: LocalDate): { date: LocalDate | null; explicit: boolean } {
  switch (ref.kind) {
    case 'today': return { date: today, explicit: true };
    case 'yesterday': return { date: addDays(today, -1), explicit: true };
    case 'days_ago': return { date: addDays(today, -ref.n), explicit: true };
    case 'absolute': return isValidLocalDate(ref.date) ? { date: ref.date, explicit: true } : { date: null, explicit: true };
    case 'unspecified': return { date: today, explicit: false };
  }
}
