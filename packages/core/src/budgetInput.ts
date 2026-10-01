import { parseOpeningBalance } from './accounts';
import type { CurrencyCode } from './money';
import type { Budget, Category, Id } from './types';

export type BudgetIssue = 'amount_invalid' | 'category_not_found' | 'category_not_expense';
export interface BudgetInput { categoryId: Id | null; amountText: string }

export const BUDGET_ISSUE_MESSAGES: Record<BudgetIssue, string> = {
  amount_invalid: 'Enter a number above zero, like 30000 or 30k.',
  category_not_found: 'That category is not available.',
  category_not_expense: 'Budgets are for spending categories.',
};

/** A budget amount: a number above zero. Same forms as an opening balance ("30k", "1.5 lakh", Bangla digits). */
export function parseBudgetAmount(text: string, currency: CurrencyCode): number | null {
  if (!text.trim()) return null;
  const v = parseOpeningBalance(text, currency);
  return v !== null && v > 0 ? v : null;
}

export function validateBudgetInput(input: BudgetInput, categories: Category[], currency: CurrencyCode): { issues: BudgetIssue[]; amountMinor: number | null } {
  const issues: BudgetIssue[] = [];
  const amountMinor = parseBudgetAmount(input.amountText, currency);
  if (amountMinor === null) issues.push('amount_invalid');
  if (input.categoryId !== null) {
    const cat = categories.find((c) => c.id === input.categoryId && !c.archivedAt);
    if (!cat) issues.push('category_not_found'); else if (cat.kind !== 'expense') issues.push('category_not_expense');
  }
  return { issues, amountMinor };
}

/** There is one budget per category (and one overall). Saving for a category that already has one replaces it rather than adding a second. */
export function buildBudget(userId: Id, newId: () => Id, input: BudgetInput, amountMinor: number, currency: CurrencyCode, existing: Budget[]): Budget {
  const current = existing.find((b) => b.categoryId === input.categoryId);
  return { id: current?.id ?? newId(), userId, categoryId: input.categoryId, amountMinor, currency };
}

/** The safety buffer kept out of Safe to Spend. Zero is allowed (no buffer); negative or non-numeric is not. */
export function parseBuffer(text: string, currency: CurrencyCode): number | null {
  return parseOpeningBalance(text, currency);
}
