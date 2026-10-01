import { describe, expect, it } from 'vitest';
import { budgetStatus, occurrences, safeToSpend, upcomingObligations, whatChanged, type Goal, type RecurringRule } from '../src';
import { accounts, categories, tx } from './fixtures';

const rule = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1', userId: 'u1', name: 'Internet', type: 'expense', amountMinor: 120_000, currency: 'BDT', accountId: 'bank', categoryId: 'bills',
  frequency: 'monthly', interval: 1, anchorDate: '2025-01-20', endDate: null, isBill: true, active: true, ...over,
});

describe('recurring', () => {
  it('generates monthly occurrences without month-end drift', () => {
    const r = rule({ anchorDate: '2025-01-31' });
    expect(occurrences(r, '2025-01-01', '2025-04-30')).toEqual(['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']);
  });
  it('supports weekly, yearly, interval, end date and inactive rules', () => {
    expect(occurrences(rule({ frequency: 'weekly', anchorDate: '2025-03-03' }), '2025-03-01', '2025-03-20')).toEqual(['2025-03-03', '2025-03-10', '2025-03-17']);
    expect(occurrences(rule({ frequency: 'yearly', anchorDate: '2024-02-29' }), '2025-01-01', '2025-12-31')).toEqual(['2025-02-28']);
    expect(occurrences(rule({ interval: 2, anchorDate: '2025-01-10' }), '2025-01-01', '2025-06-30')).toEqual(['2025-01-10', '2025-03-10', '2025-05-10']);
    expect(occurrences(rule({ endDate: '2025-02-28' }), '2025-01-01', '2025-06-30')).toEqual(['2025-01-20', '2025-02-20']);
    expect(occurrences(rule({ active: false }), '2025-01-01', '2025-06-30')).toEqual([]);
  });
  it('excludes occurrences already paid and ones before today', () => {
    const paid = tx({ type: 'expense', amountMinor: 120_000, localDate: '2025-03-20', recurringRuleId: 'r1', occurrenceDate: '2025-03-20' });
    expect(upcomingObligations([rule()], [paid], '2025-03-15', '2025-03-31')).toEqual([]);
    expect(upcomingObligations([rule()], [], '2025-03-15', '2025-03-31')).toHaveLength(1);
    expect(upcomingObligations([rule()], [], '2025-03-21', '2025-03-31')).toHaveLength(0);
  });
});

describe('budgets', () => {
  const b = { id: 'b1', userId: 'u1', categoryId: 'food', amountMinor: 1_000_000, currency: 'BDT' };
  const food = (amt: number, date: string, c = 'groceries') => tx({ type: 'expense', amountMinor: amt, localDate: date, categoryId: c });

  it('sums the whole category subtree and computes remaining', () => {
    const s = budgetStatus(b, [food(300_000, '2025-03-02'), food(100_000, '2025-03-03', 'dining'), tx({ type: 'expense', amountMinor: 999, localDate: '2025-03-03', categoryId: 'transport' })], categories, '2025-03-10');
    expect(s.spentMinor).toBe(400_000);
    expect(s.remainingMinor).toBe(600_000);
    expect(s.state).toBe('at_risk'); // 400k in 10 days projects to 1.24M > 1M
  });
  it('is on track when pace is fine, over when exceeded', () => {
    expect(budgetStatus(b, [food(100_000, '2025-03-02')], categories, '2025-03-15').state).toBe('on_track');
    expect(budgetStatus(b, [food(1_000_001, '2025-03-02')], categories, '2025-03-15').state).toBe('over');
  });
  it('does not raise pace-based alarms in the first week', () => {
    expect(budgetStatus(b, [food(400_000, '2025-03-02')], categories, '2025-03-03').state).toBe('on_track');
  });
  it('ignores refunds in the wrong month and deleted transactions', () => {
    const deleted = { ...food(900_000, '2025-03-02'), deletedAt: 'x' };
    expect(budgetStatus(b, [deleted, food(50_000, '2025-02-28')], categories, '2025-03-10').spentMinor).toBe(0);
  });
});

describe('safe to spend', () => {
  const base = { accounts, transactions: [], recurringRules: [], goals: [] as Goal[], today: '2025-03-21', bufferMinor: 0 };
  it('counts only liquid accounts and divides by remaining days including today', () => {
    const r = safeToSpend(base);
    expect(r.liquidMinor).toBe(500_000 + 10_000_000 + 200_000); // savings excluded
    expect(r.daysRemaining).toBe(11); // Mar 21..31
    expect(r.availableMinor).toBe(10_700_000);
    expect(r.perDayMinor).toBe(Math.floor(10_700_000 / 11));
  });
  it('subtracts upcoming bills, goal reserve and buffer', () => {
    const goal: Goal = { id: 'g1', userId: 'u1', name: 'Trip', currency: 'BDT', targetMinor: 6_000_000, targetDate: '2025-08-31', monthlyContributionMinor: null, openingSavedMinor: 0 };
    const r = safeToSpend({ ...base, recurringRules: [rule()], goals: [goal], bufferMinor: 1_000_000 });
    expect(r.upcomingMinor).toBe(0); // internet due on the 20th: already past, ignored
    const r2 = safeToSpend({ ...base, today: '2025-03-15', recurringRules: [rule()], goals: [goal], bufferMinor: 1_000_000 });
    expect(r2.upcomingMinor).toBe(120_000);
    expect(r2.goalReserves[0]!.requiredMinor).toBe(Math.ceil(6_000_000 / 6)); // Mar..Aug
    expect(r2.availableMinor).toBe(10_700_000 - 120_000 - 1_000_000 - 1_000_000);
  });
  it('shrinks the goal reserve once this month\'s contribution is made', () => {
    const goal: Goal = { id: 'g1', userId: 'u1', name: 'Fund', currency: 'BDT', targetMinor: 10_000_000, targetDate: null, monthlyContributionMinor: 500_000, openingSavedMinor: 0 };
    const c = tx({ type: 'goal_contribution', amountMinor: 200_000, localDate: '2025-03-05', accountId: 'bank', toAccountId: 'sav', goalId: 'g1' });
    const r = safeToSpend({ ...base, transactions: [c], goals: [goal] });
    expect(r.reservedGoalsMinor).toBe(300_000);
    expect(r.liquidMinor).toBe(500_000 + 10_000_000 - 200_000 + 200_000);
  });
  it('can go negative and the per-day figure never does', () => {
    const r = safeToSpend({ ...base, bufferMinor: 50_000_000 });
    expect(r.availableMinor).toBeLessThan(0);
    expect(r.perDayMinor).toBe(0);
  });
  it('handles the last day of the period', () => {
    expect(safeToSpend({ ...base, today: '2025-03-31' }).daysRemaining).toBe(1);
  });
});

describe('what changed', () => {
  const e = (amt: number, date: string, c: string) => tx({ type: 'expense', amountMinor: amt, localDate: date, categoryId: c });
  const history = [
    e(10_000, '2025-01-15', 'other'), // tracking starts mid-January, so January is a partial month and is excluded
    e(100_000, '2025-02-05', 'dining'), e(100_000, '2025-02-06', 'rideshare'),
  ];
  it('reports insufficient data without a complete baseline month', () => {
    expect(whatChanged([], categories, '2025-03-15')).toEqual({ status: 'insufficient_data', reason: 'no_transactions' });
    expect(whatChanged([e(1, '2025-03-10', 'other')], categories, '2025-03-15')).toEqual({ status: 'insufficient_data', reason: 'no_complete_baseline_month' });
  });
  it('waits for the first week of the month before comparing', () => {
    expect(whatChanged([...history, e(500_000, '2025-03-01', 'dining')], categories, '2025-03-06')).toEqual({ status: 'insufficient_data', reason: 'early_in_month' });
    expect(whatChanged([...history, e(500_000, '2025-03-01', 'dining')], categories, '2025-03-07').status).toBe('ok');
  });
  it('compares pace-matched spending and ranks the driving categories with evidence', () => {
    const march = [e(400_000, '2025-03-05', 'dining'), e(110_000, '2025-03-06', 'rideshare')];
    const r = whatChanged([...history, ...march], categories, '2025-03-15');
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.baselineMonths).toEqual(['2025-02']); // January was only partly tracked
    expect(r.direction).toBe('higher');
    expect(r.baselineMinor).toBe(200_000);
    expect(r.currentMinor).toBe(510_000);
    expect(r.deltaMinor).toBe(310_000);
    expect(r.drivers[0]).toMatchObject({ categoryId: 'food', deltaMinor: 300_000 });
    expect(r.drivers[0]!.transactionIds).toEqual([march[0]!.id]);
    expect(r.drivers.find((d) => d.categoryId === 'transport')).toBeUndefined(); // below materiality
  });
  it('matches the pace: later-in-month baseline spending is excluded', () => {
    const feb = [e(500_000, '2025-02-25', 'shopping')]; // after day 15: not part of the comparison
    const r = whatChanged([...history, ...feb, e(200_000, '2025-03-05', 'dining')], categories, '2025-03-15');
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.baselineMinor).toBe(200_000);
  });
  it('says "similar" and lists no drivers when within tolerance', () => {
    const r = whatChanged([...history, e(100_000, '2025-03-05', 'dining'), e(102_000, '2025-03-06', 'rideshare')], categories, '2025-03-15');
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.direction).toBe('similar');
    expect(r.drivers).toEqual([]);
  });
  it('reports lower spending too', () => {
    const r = whatChanged([...history, e(50_000, '2025-03-05', 'dining')], categories, '2025-03-15');
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.direction).toBe('lower');
    expect(r.deltaMinor).toBe(-150_000);
  });
});
