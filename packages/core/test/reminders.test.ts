import { describe, expect, it } from 'vitest';
import { InMemoryLedgerRepository, REMINDER_MAX, planReminders, type RecurringRule } from '../src';
import { USER } from './fixtures';
import { sqlRepo } from './nodeSqlite';

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({ id: 'r1', userId: USER, name: 'Internet', type: 'expense', amountMinor: 120_000, currency: 'BDT', accountId: 'cash', categoryId: null,
  frequency: 'monthly', interval: 1, anchorDate: '2025-01-17', endDate: null, isBill: true, active: true, ...over });
const NOW = { date: '2025-03-15', hour: 8, minute: 0 };

describe('bill reminders', () => {
  it('plans an eve and a day-of reminder at the chosen hour, with no amount in the text', () => {
    const r = planReminders([rule()], [], NOW, { hour: 9 });
    expect(r.map((x) => [x.id, x.date, x.hour, x.title])).toEqual([
      ['bill:r1:2025-03-17:eve', '2025-03-16', 9, 'Internet is due tomorrow'],
      ['bill:r1:2025-03-17:day', '2025-03-17', 9, 'Internet is due today'],
    ]);
    for (const x of r) expect(x.title + x.body).not.toMatch(/\d{3,}|৳|BDT/);
  });
  it('skips reminders whose time has passed', () => {
    expect(planReminders([rule({ anchorDate: '2025-01-15' })], [], { date: '2025-03-15', hour: 10, minute: 0 }, { hour: 9 }).map((x) => x.id)).toEqual([]);
    expect(planReminders([rule({ anchorDate: '2025-01-16' })], [], { date: '2025-03-15', hour: 8, minute: 0 }, { hour: 9 }).map((x) => x.id)).toEqual(['bill:r1:2025-03-16:eve', 'bill:r1:2025-03-16:day']);
  });
  it('leaves out paid occurrences, paused rules and income', () => {
    const paid = [{ deletedAt: null, recurringRuleId: 'r1', occurrenceDate: '2025-03-17' }] as never;
    expect(planReminders([rule()], paid, NOW)).toEqual([]);
    expect(planReminders([rule({ active: false })], [], NOW)).toEqual([]);
    expect(planReminders([rule({ type: 'income' })], [], NOW)).toEqual([]);
  });
  it('is capped to the nearest reminders and ordered by time', () => {
    const many = Array.from({ length: 30 }, (_, i) => rule({ id: `r${i}`, name: `B${i}`, anchorDate: `2025-03-${String(16 + (i % 10)).padStart(2, '0')}` }));
    const r = planReminders(many, [], NOW);
    expect(r).toHaveLength(REMINDER_MAX);
    expect([...r].sort((a, b) => a.date.localeCompare(b.date))).toEqual(r);
  });
  it('is stable: planning twice gives identical ids', () => {
    expect(planReminders([rule()], [], NOW).map((x) => x.id)).toEqual(planReminders([rule()], [], NOW).map((x) => x.id));
  });
});

describe.each([['in-memory', async () => new InMemoryLedgerRepository()], ['sqlite', sqlRepo]] as const)('%s device settings', (_n, make) => {
  it('stores per user and key, and is cleared with the user’s data', async () => {
    const repo = await make();
    expect(await repo.getSetting(USER, 'k')).toBeNull();
    await repo.putSetting(USER, 'k', '1'); await repo.putSetting(USER, 'k', '2'); await repo.putSetting('other', 'k', 'x');
    expect(await repo.getSetting(USER, 'k')).toBe('2');
    await repo.deleteAllUserData(USER);
    expect(await repo.getSetting(USER, 'k')).toBeNull();
    expect(await repo.getSetting('other', 'k')).toBe('x');
  });
});
