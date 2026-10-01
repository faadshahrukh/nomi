import { isValidLocalDate, type LocalDate } from './dates';
import { parseBudgetAmount } from './budgetInput';
import { parseOpeningBalance } from './accounts';
import type { CurrencyCode } from './money';
import type { Goal, Id } from './types';

export type GoalIssue = 'name_required' | 'name_too_long' | 'name_taken' | 'target_invalid' | 'date_invalid' | 'date_past' | 'monthly_invalid' | 'saved_invalid';

export interface GoalInput { name: string; targetText: string; targetDate: string; monthlyText: string; savedText: string }

export const GOAL_ISSUE_MESSAGES: Record<GoalIssue, string> = {
  name_required: 'Give the goal a name, like "Emergency fund".',
  name_too_long: 'Use a shorter name (80 characters at most).',
  name_taken: 'You already have a goal with that name.',
  target_invalid: 'Enter the amount you want to reach as a number above zero, like 100000 or 1 lakh.',
  date_invalid: 'Enter the date as YYYY-MM-DD, or leave it empty.',
  date_past: 'Pick a date in the future, or leave it empty.',
  monthly_invalid: 'Enter the monthly amount as a number, or leave it empty.',
  saved_invalid: 'Enter what you have already saved as a number, or leave it empty for none.',
};

/** Name, a target above zero, and optional date, fixed monthly amount and amount already saved. Empty optional fields mean "not set". */
export function validateGoalInput(i: GoalInput, existing: Goal[], editingId: Id | null, currency: CurrencyCode, today: LocalDate):
  { issues: GoalIssue[]; targetMinor: number | null; monthlyMinor: number | null; savedMinor: number } {
  const issues: GoalIssue[] = [];
  const name = i.name.trim();
  if (!name) issues.push('name_required'); else if (name.length > 80) issues.push('name_too_long');
  else if (existing.some((g) => g.id !== editingId && g.name.trim().toLowerCase() === name.toLowerCase())) issues.push('name_taken');
  const targetMinor = parseBudgetAmount(i.targetText, currency);
  if (targetMinor === null) issues.push('target_invalid');
  const date = i.targetDate.trim();
  if (date) { if (!isValidLocalDate(date)) issues.push('date_invalid'); else if (date <= today) issues.push('date_past'); }
  let monthlyMinor: number | null = null;
  if (i.monthlyText.trim()) { monthlyMinor = parseOpeningBalance(i.monthlyText, currency); if (monthlyMinor === null) issues.push('monthly_invalid'); }
  const savedMinor = i.savedText.trim() ? parseOpeningBalance(i.savedText, currency) : 0;
  if (savedMinor === null) issues.push('saved_invalid');
  return { issues, targetMinor, monthlyMinor, savedMinor: savedMinor ?? 0 };
}

export function buildGoal(userId: Id, id: Id, i: GoalInput, v: { targetMinor: number; monthlyMinor: number | null; savedMinor: number }, currency: CurrencyCode, existing?: Goal | null): Goal {
  return { id: existing?.id ?? id, userId, name: i.name.trim(), currency, targetMinor: v.targetMinor, targetDate: i.targetDate.trim() || null, monthlyContributionMinor: v.monthlyMinor, openingSavedMinor: v.savedMinor };
}
