import { describe, expect, it } from 'vitest';
import { GOAL_ISSUE_MESSAGES, buildGoal, goalSavedMinor, safeToSpend, validateGoalInput, type Goal, type GoalInput } from '../src';
import { USER, accounts } from './fixtures';

const ok: GoalInput = { name: 'Emergency fund', targetText: '1 lakh', targetDate: '2025-12-31', monthlyText: '10k', savedText: '5000' };
const check = (i: Partial<GoalInput>, existing: Goal[] = [], editing: string | null = null) => validateGoalInput({ ...ok, ...i }, existing, editing, 'BDT', '2025-03-15');

describe('goal input', () => {
  it('accepts a full goal and builds it', () => {
    const v = check({});
    expect(v).toEqual({ issues: [], targetMinor: 10_000_000, monthlyMinor: 1_000_000, savedMinor: 500_000 });
    expect(buildGoal(USER, 'g1', ok, { targetMinor: v.targetMinor!, monthlyMinor: v.monthlyMinor, savedMinor: v.savedMinor }, 'BDT')).toEqual({
      id: 'g1', userId: USER, name: 'Emergency fund', currency: 'BDT', targetMinor: 10_000_000, targetDate: '2025-12-31', monthlyContributionMinor: 1_000_000, openingSavedMinor: 500_000 });
  });
  it('treats empty optional fields as not set', () => {
    const v = check({ targetDate: '', monthlyText: '', savedText: '' });
    expect(v).toEqual({ issues: [], targetMinor: 10_000_000, monthlyMinor: null, savedMinor: 0 });
    expect(buildGoal(USER, 'g', { ...ok, targetDate: '' }, { targetMinor: 1, monthlyMinor: null, savedMinor: 0 }, 'BDT').targetDate).toBeNull();
  });
  it('names each problem', () => {
    expect(check({ name: ' ', targetText: '0' }).issues).toEqual(['name_required', 'target_invalid']);
    expect(check({ targetDate: '2025-02-30' }).issues).toEqual(['date_invalid']);
    expect(check({ targetDate: '2025-03-15' }).issues).toEqual(['date_past']);
    expect(check({ monthlyText: 'abc' }).issues).toEqual(['monthly_invalid']);
    expect(check({ savedText: '-5' }).issues).toEqual(['saved_invalid']);
    expect(Object.values(GOAL_ISSUE_MESSAGES).every((m) => m.length > 5)).toBe(true);
  });
  it('rejects a duplicate name, except for the goal being edited', () => {
    const existing = [{ id: 'g1', name: 'Emergency Fund' } as Goal];
    expect(check({}, existing).issues).toEqual(['name_taken']);
    expect(check({}, existing, 'g1').issues).toEqual([]);
  });
  it('a new goal immediately feeds Safe to Spend (what is still to be set aside this month)', () => {
    const g = buildGoal(USER, 'g1', ok, { targetMinor: 10_000_000, monthlyMinor: 1_000_000, savedMinor: 500_000 }, 'BDT');
    expect(goalSavedMinor(g, [])).toBe(500_000);
    const s = safeToSpend({ accounts: accounts.map((a) => ({ ...a })), transactions: [], recurringRules: [], goals: [g], today: '2025-03-15', bufferMinor: 0 });
    expect(s.reservedGoalsMinor).toBe(1_000_000);
  });
});
