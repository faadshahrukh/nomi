import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, buildCategory, buildPerson, canArchiveAccount, canArchiveCategory, validateAccountEdit, validateCategory, validatePerson, type Category, type Person } from '../src';
import { USER, accounts } from './fixtures';

const mine = (over: Partial<Category>): Category => ({ id: 'mine', userId: USER, parentId: null, name: 'Pets', kind: 'expense', archivedAt: null, ...over });

describe('people', () => {
  const people: Person[] = [{ id: 'r', userId: USER, name: 'Rahim' }];
  it('validates names', () => {
    expect(validatePerson('Karim', people, null)).toEqual([]);
    expect(validatePerson('  ', people, null)).toEqual(['name_required']);
    expect(validatePerson('rahim', people, null)).toEqual(['name_taken']);
    expect(validatePerson('Rahim', people, 'r')).toEqual([]); // renaming to the same name is fine
    expect(validatePerson('Me', people, null)).toEqual(['name_is_me']);
    expect(validatePerson('x'.repeat(81), people, null)).toEqual(['name_too_long']);
    expect(buildPerson(USER, 'new', '  Karim ')).toEqual({ id: 'new', userId: USER, name: 'Karim' });
    expect(buildPerson(USER, 'new', 'Rahima', people[0]).id).toBe('r');
  });
});

describe('account editing', () => {
  const edit = { name: 'Savings', type: 'savings' as const, includeInLiquid: false, openingBalanceText: '40k' };
  it('accepts a good edit and keeps the balance exact', () => {
    expect(validateAccountEdit({ ...edit, name: 'Rainy day' }, accounts, 'sav', 'BDT')).toEqual({ issues: [], openingBalanceMinor: 4_000_000 });
    expect(validateAccountEdit(edit, accounts, 'sav', 'BDT').issues).toEqual([]); // same name as itself
  });
  it('names each problem', () => {
    expect(validateAccountEdit({ ...edit, name: 'cash' }, accounts, 'sav', 'BDT').issues).toEqual(['name_taken']);
    expect(validateAccountEdit({ ...edit, openingBalanceText: 'lots' }, accounts, 'sav', 'BDT').issues).toEqual(['balance_invalid']);
    expect(validateAccountEdit({ ...edit, name: '' }, accounts, 'sav', 'BDT').issues).toEqual(['name_required']);
  });
  it('never lets the last live account be archived', () => {
    expect(canArchiveAccount(accounts, 'cash')).toBe(true);
    expect(canArchiveAccount([accounts[0]!], 'cash')).toBe(false);
    expect(canArchiveAccount(accounts.map((a) => (a.id === 'bank' || a.id === 'bkash' || a.id === 'sav' ? { ...a, archivedAt: 'x' } : a)), 'cash')).toBe(false);
  });
});

describe('categories', () => {
  const all = [...DEFAULT_CATEGORIES, mine({})];
  it('accepts your own main category and sub-category', () => {
    expect(validateCategory({ name: 'Hobbies', kind: 'expense', parentId: null }, all, null)).toEqual([]);
    expect(validateCategory({ name: 'Vet', kind: 'expense', parentId: 'mine' }, all, null)).toEqual([]);
    expect(validateCategory({ name: 'Side hustle', kind: 'income', parentId: null }, all, null)).toEqual([]);
    expect(buildCategory(USER, 'c1', { name: ' Vet ', kind: 'expense', parentId: 'mine' })).toEqual({ id: 'c1', userId: USER, parentId: 'mine', name: 'Vet', kind: 'expense', archivedAt: null });
  });
  it('keeps names unique among siblings of the same kind, but allows the same name elsewhere', () => {
    expect(validateCategory({ name: 'food', kind: 'expense', parentId: null }, all, null)).toEqual(['name_taken']);
    expect(validateCategory({ name: 'Groceries', kind: 'expense', parentId: 'cat.food' }, all, null)).toEqual(['name_taken']);
    expect(validateCategory({ name: 'Groceries', kind: 'expense', parentId: 'cat.transport' }, all, null)).toEqual([]);
    expect(validateCategory({ name: 'Gift', kind: 'expense', parentId: null }, all, null)).toEqual([]); // "Gift" exists only as income
    expect(validateCategory({ name: 'Pets', kind: 'expense', parentId: null }, all, 'mine')).toEqual([]);
  });
  it('limits depth and requires the parent to match', () => {
    expect(validateCategory({ name: 'X', kind: 'expense', parentId: 'cat.food.dining' }, all, null)).toEqual(['parent_invalid']);
    expect(validateCategory({ name: 'X', kind: 'income', parentId: 'cat.food' }, all, null)).toEqual(['parent_invalid']);
    expect(validateCategory({ name: 'X', kind: 'expense', parentId: 'nope' }, all, null)).toEqual(['parent_invalid']);
    expect(validateCategory({ name: 'Pets', kind: 'expense', parentId: 'mine' }, all, 'mine')).toEqual(['parent_invalid']); // not its own parent
  });
  it('never edits built-in categories', () => {
    expect(validateCategory({ name: 'Meals', kind: 'expense', parentId: null }, all, 'cat.food')).toEqual(['system_readonly']);
  });
  it('does not let a category with sub-categories change kind', () => {
    const tree = [...all, mine({ id: 'kid', parentId: 'mine', name: 'Vet' })];
    expect(validateCategory({ name: 'Pets', kind: 'income', parentId: null }, tree, 'mine')).toEqual(['has_children_kind']);
  });
  it('archives only your own, and only leaf categories', () => {
    expect(canArchiveCategory(all, 'cat.food')).toEqual({ ok: false, reason: 'system_readonly' });
    expect(canArchiveCategory(all, 'mine')).toEqual({ ok: true });
    expect(canArchiveCategory([...all, mine({ id: 'kid', parentId: 'mine' })], 'mine')).toEqual({ ok: false, reason: 'has_children' });
    expect(canArchiveCategory([...all, mine({ id: 'kid', parentId: 'mine', archivedAt: 'x' })], 'mine')).toEqual({ ok: true });
  });
});
