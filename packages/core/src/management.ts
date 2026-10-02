import { parseOpeningBalance } from './accounts';
import type { CurrencyCode } from './money';
import type { Account, AccountType, Category, Id, Person } from './types';

const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase();

/** The one-line rules every name follows: present, at most 80 characters, and not already taken. */
function nameIssue(name: string, taken: boolean): 'name_required' | 'name_too_long' | 'name_taken' | null {
  const n = name.trim();
  if (!n) return 'name_required';
  if (n.length > 80) return 'name_too_long';
  return taken ? 'name_taken' : null;
}

export const NAME_MESSAGES = {
  name_required: 'Give it a name.',
  name_too_long: 'Use a shorter name (80 characters at most).',
  name_taken: 'You already have one with that name.',
} as const;

// ---- people --------------------------------------------------------------------------------------------------------------------
export type PersonIssue = keyof typeof NAME_MESSAGES | 'name_is_me';
export const PERSON_MESSAGES: Record<PersonIssue, string> = { ...NAME_MESSAGES, name_is_me: '"Me" is you. Use your friend\'s own name.' };

export function validatePerson(name: string, existing: Person[], editingId: Id | null): PersonIssue[] {
  if (/^(me|myself|i)$/i.test(name.trim())) return ['name_is_me'];
  const issue = nameIssue(name, existing.some((p) => p.id !== editingId && norm(p.name) === norm(name)));
  return issue ? [issue] : [];
}
export const buildPerson = (userId: Id, id: Id, name: string, existing?: Person | null): Person => ({ id: existing?.id ?? id, userId, name: name.trim() });

// ---- accounts (editing) --------------------------------------------------------------------------------------------------------
export type AccountEditIssue = keyof typeof NAME_MESSAGES | 'balance_invalid';
export const ACCOUNT_EDIT_MESSAGES: Record<AccountEditIssue, string> = { ...NAME_MESSAGES, balance_invalid: 'Enter the starting balance as a number, like 5000. Leave it empty for zero.' };

export interface AccountEdit { name: string; type: AccountType; includeInLiquid: boolean; openingBalanceText: string }

export function validateAccountEdit(edit: AccountEdit, accounts: Account[], editingId: Id, currency: CurrencyCode): { issues: AccountEditIssue[]; openingBalanceMinor: number | null } {
  const issues: AccountEditIssue[] = [];
  const n = nameIssue(edit.name, accounts.some((a) => a.id !== editingId && !a.archivedAt && norm(a.name) === norm(edit.name)));
  if (n) issues.push(n);
  const opening = parseOpeningBalance(edit.openingBalanceText, currency);
  if (opening === null) issues.push('balance_invalid');
  return { issues, openingBalanceMinor: opening };
}

/** The last live account cannot be archived: nothing could be recorded without one. */
export const canArchiveAccount = (accounts: Account[], id: Id): boolean => accounts.some((a) => a.id !== id && !a.archivedAt);

// ---- categories ---------------------------------------------------------------------------------------------------------------
export type CategoryIssue = keyof typeof NAME_MESSAGES | 'parent_invalid' | 'system_readonly' | 'has_children_kind';
export const CATEGORY_MESSAGES: Record<CategoryIssue, string> = {
  ...NAME_MESSAGES,
  parent_invalid: 'Choose a main category of the same kind, not a sub-category.',
  system_readonly: 'Built-in categories cannot be changed. Add your own instead.',
  has_children_kind: 'This category has sub-categories, so its kind cannot change.',
};

export interface CategoryInput { name: string; kind: 'expense' | 'income'; parentId: Id | null }

/**
 * Your own categories sit next to the built-in ones, at most two levels deep (a main category and its sub-categories).
 * A name must be unique among the live categories of the same kind in the same place; built-in categories can never be edited.
 */
export function validateCategory(input: CategoryInput, categories: Category[], editingId: Id | null): CategoryIssue[] {
  const editing = editingId ? categories.find((c) => c.id === editingId) : null;
  if (editing && editing.userId === null) return ['system_readonly'];
  const issues: CategoryIssue[] = [];
  const parent = input.parentId ? categories.find((c) => c.id === input.parentId && !c.archivedAt) : null;
  if (input.parentId && (!parent || parent.parentId !== null || parent.kind !== input.kind || input.parentId === editingId)) issues.push('parent_invalid');
  if (editing && editing.kind !== input.kind && categories.some((c) => c.parentId === editing.id && !c.archivedAt)) issues.push('has_children_kind');
  const siblings = categories.filter((c) => c.id !== editingId && !c.archivedAt && c.kind === input.kind && (c.parentId ?? null) === (input.parentId ?? null));
  const n = nameIssue(input.name, siblings.some((c) => norm(c.name) === norm(input.name)));
  if (n) issues.unshift(n);
  return issues;
}

export function buildCategory(userId: Id, id: Id, input: CategoryInput, existing?: Category | null): Category {
  return { id: existing?.id ?? id, userId, parentId: input.parentId, name: input.name.trim(), kind: input.kind, archivedAt: existing?.archivedAt ?? null };
}

/** Archiving hides a category from pickers but keeps it on past transactions. Only your own can be archived, and not one with live sub-categories. */
export function canArchiveCategory(categories: Category[], id: Id): { ok: true } | { ok: false; reason: 'system_readonly' | 'has_children' } {
  const c = categories.find((x) => x.id === id);
  if (!c || c.userId === null) return { ok: false, reason: 'system_readonly' };
  return categories.some((x) => x.parentId === id && !x.archivedAt) ? { ok: false, reason: 'has_children' } : { ok: true };
}
