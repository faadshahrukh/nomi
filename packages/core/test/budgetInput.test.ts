import { describe, expect, it } from 'vitest';
import { BUDGET_ISSUE_MESSAGES, InMemoryLedgerRepository, buildBudget, parseBudgetAmount, parseBuffer, validateBudgetInput, type Budget } from '../src';
import { USER, categories } from './fixtures';
import { sqlRepo } from './nodeSqlite';

describe('budget input', () => {
  it('parses amounts above zero in the forms people type', () => {
    expect(parseBudgetAmount('30000', 'BDT')).toBe(3_000_000);
    expect(parseBudgetAmount('30k', 'BDT')).toBe(3_000_000);
    expect(parseBudgetAmount('১২০০', 'BDT')).toBe(120_000);
    expect(parseBudgetAmount('', 'BDT')).toBeNull();
    expect(parseBudgetAmount('0', 'BDT')).toBeNull();
    expect(parseBudgetAmount('-5', 'BDT')).toBeNull();
    expect(parseBudgetAmount('5000 and more', 'BDT')).toBeNull();
  });
  it('validates the category', () => {
    expect(validateBudgetInput({ categoryId: null, amountText: '5k' }, categories, 'BDT')).toEqual({ issues: [], amountMinor: 500_000 });
    expect(validateBudgetInput({ categoryId: 'dining', amountText: '5k' }, categories, 'BDT').issues).toEqual([]);
    expect(validateBudgetInput({ categoryId: 'salary', amountText: '5k' }, categories, 'BDT').issues).toEqual(['category_not_expense']);
    expect(validateBudgetInput({ categoryId: 'nope', amountText: 'x' }, categories, 'BDT').issues).toEqual(['amount_invalid', 'category_not_found']);
    expect(Object.keys(BUDGET_ISSUE_MESSAGES)).toHaveLength(3);
  });
  it('replaces the existing budget for a category instead of adding a second', () => {
    const existing: Budget[] = [{ id: 'b1', userId: USER, categoryId: 'dining', amountMinor: 100, currency: 'BDT' }];
    let n = 0;
    expect(buildBudget(USER, () => `new${++n}`, { categoryId: 'dining', amountText: '' }, 900, 'BDT', existing).id).toBe('b1');
    expect(buildBudget(USER, () => `new${++n}`, { categoryId: null, amountText: '' }, 900, 'BDT', existing).id).toBe('new1');
  });
  it('allows a zero safety buffer but not a negative one', () => {
    expect(parseBuffer('', 'BDT')).toBe(0);
    expect(parseBuffer('2k', 'BDT')).toBe(200_000);
    expect(parseBuffer('-1', 'BDT')).toBeNull();
    expect(parseBuffer('abc', 'BDT')).toBeNull();
  });
});

describe.each([['in-memory', async () => new InMemoryLedgerRepository()], ['sqlite', sqlRepo]] as const)('%s deleteBudget', (_n, make) => {
  it('removes only that user’s budget, and a missing id is fine', async () => {
    const repo = await make();
    const b = (id: string, userId = USER): Budget => ({ id, userId, categoryId: null, amountMinor: 1, currency: 'BDT' });
    await repo.putBudget(USER, b('a')); await repo.putBudget(USER, b('b'));
    await repo.deleteBudget(USER, 'a'); await repo.deleteBudget(USER, 'missing');
    expect((await repo.listBudgets(USER)).map((x) => x.id)).toEqual(['b']);
    await repo.deleteBudget('someone-else', 'b');
    expect(await repo.listBudgets(USER)).toHaveLength(1);
  });
});
