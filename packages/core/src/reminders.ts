import { addDays, type LocalDate } from './dates';
import { occurrences } from './recurring';
import type { RecurringRule, Transaction } from './types';

export interface PlannedReminder {
  /** Stable for a given bill, due date and kind, so re-planning never duplicates a reminder. */
  id: string;
  /** Local wall-clock time on the device. */
  date: LocalDate; hour: number; minute: number;
  title: string; body: string;
}

export const REMINDER_DEFAULT_HOUR = 9;
/** Phones cap how many notifications an app may schedule (iOS: 64). Stay well under, and keep only the nearest. */
export const REMINDER_MAX = 20;
export const REMINDER_DAYS_AHEAD = 14;

/**
 * Bill reminders: a heads-up the day before and a nudge on the day, for unpaid occurrences only, at the user's chosen hour.
 * Reminders that are already in the past are dropped. The text never contains an amount: lock screens are public.
 * Pure: the caller says what "now" is, and schedules whatever this returns.
 */
export function planReminders(rules: RecurringRule[], txs: Transaction[], now: { date: LocalDate; hour: number; minute: number }, opts: { hour?: number; max?: number; daysAhead?: number } = {}): PlannedReminder[] {
  const hour = opts.hour ?? REMINDER_DEFAULT_HOUR, max = opts.max ?? REMINDER_MAX, to = addDays(now.date, (opts.daysAhead ?? REMINDER_DAYS_AHEAD) + 1);
  const paid = (r: RecurringRule, d: LocalDate) => txs.some((t) => !t.deletedAt && t.recurringRuleId === r.id && t.occurrenceDate === d);
  const future = (date: LocalDate) => date > now.date || (date === now.date && (hour > now.hour || (hour === now.hour && 0 > now.minute)));
  const out: PlannedReminder[] = [];
  for (const r of rules.filter((x) => x.type === 'expense' && x.active)) {
    for (const due of occurrences(r, now.date, to)) {
      if (paid(r, due)) continue;
      const eve = addDays(due, -1);
      if (future(eve)) out.push({ id: `bill:${r.id}:${due}:eve`, date: eve, hour, minute: 0, title: `${r.name} is due tomorrow`, body: 'Open Nomi to see it, or mark it paid.' });
      if (future(due)) out.push({ id: `bill:${r.id}:${due}:day`, date: due, hour, minute: 0, title: `${r.name} is due today`, body: 'Open Nomi to mark it paid.' });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour || a.id.localeCompare(b.id)).slice(0, max);
}
