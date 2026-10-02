import type { Account, Budget, Category, Goal, Id, Person, Profile, RecurringRule, Transaction } from '../types';
import type { SyncEntity } from './types';

type Kind = 'plain' | 'ts' | 'time';
type Spec = Array<[domain: string, server: string, kind?: Kind]>;

/**
 * The only place that knows both spellings of a record: the app's (camelCase) and the server's (snake_case).
 * Listing the fields explicitly means a field added to one side but not the other shows up in the round-trip tests instead of
 * silently never syncing.
 */
const SPECS: Record<SyncEntity, Spec> = {
  profiles: [['country', 'country'], ['currency', 'currency'], ['timezone', 'timezone'], ['locale', 'locale'], ['confirmationPref', 'confirmation_pref'],
    ['highImpactMinor', 'high_impact_minor'], ['safetyBufferMinor', 'safety_buffer_minor'], ['retainRawInput', 'retain_raw_input'], ['aiProcessing', 'ai_processing'],
    ['displayName', 'display_name'], ['primaryGoals', 'primary_goals'], ['onboardedAt', 'onboarded_at', 'ts']],
  categories: [['id', 'id'], ['parentId', 'parent_id'], ['name', 'name'], ['kind', 'kind'], ['archivedAt', 'archived_at', 'ts']],
  accounts: [['id', 'id'], ['name', 'name'], ['type', 'type'], ['currency', 'currency'], ['aliases', 'aliases'], ['openingBalanceMinor', 'opening_balance_minor'],
    ['includeInLiquid', 'include_in_liquid'], ['archivedAt', 'archived_at', 'ts']],
  people: [['id', 'id'], ['name', 'name']],
  goals: [['id', 'id'], ['name', 'name'], ['currency', 'currency'], ['targetMinor', 'target_minor'], ['targetDate', 'target_date'],
    ['monthlyContributionMinor', 'monthly_contribution_minor'], ['openingSavedMinor', 'opening_saved_minor']],
  recurring_rules: [['id', 'id'], ['name', 'name'], ['type', 'type'], ['amountMinor', 'amount_minor'], ['currency', 'currency'], ['accountId', 'account_id'],
    ['categoryId', 'category_id'], ['frequency', 'frequency'], ['interval', 'interval_n'], ['anchorDate', 'anchor_date'], ['endDate', 'end_date'], ['isBill', 'is_bill'], ['active', 'active']],
  budgets: [['id', 'id'], ['categoryId', 'category_id'], ['amountMinor', 'amount_minor'], ['currency', 'currency']],
  transactions: [['id', 'id'], ['type', 'type'], ['amountMinor', 'amount_minor'], ['currency', 'currency'], ['categoryId', 'category_id'], ['merchantName', 'merchant_name'],
    ['accountId', 'account_id'], ['toAccountId', 'to_account_id'], ['localDate', 'local_date'], ['localTime', 'local_time', 'time'], ['notes', 'notes'], ['paidBy', 'paid_by'],
    ['splits', 'splits'], ['counterpartyId', 'counterparty_id'], ['debtDirection', 'debt_direction'], ['repaymentDirection', 'repayment_direction'], ['goalId', 'goal_id'],
    ['recurringRuleId', 'recurring_rule_id'], ['occurrenceDate', 'occurrence_date'], ['source', 'source'], ['aiConfidence', 'ai_confidence'], ['rawInput', 'raw_input'],
    ['createdAt', 'created_at', 'ts'], ['deletedAt', 'deleted_at', 'ts']],
};

const iso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(String(v)).toISOString());
const normalise = (v: unknown, kind: Kind): unknown => {
  if (v === undefined) return null;
  if (kind === 'ts') return iso(v);
  if (kind === 'time') return v === null ? null : String(v).slice(0, 5);
  return v;
};

/** The wire row for a record. `deletedAt` is only sent for budgets (the one thing the app really deletes) when `tombstone` is given. */
export function toServerRow(entity: SyncEntity, domain: object, tombstone?: string): Record<string, unknown> {
  const src = domain as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  for (const [d, s] of SPECS[entity]) row[s] = src[d] === undefined ? null : src[d];
  if (entity === 'budgets' && tombstone) row.deleted_at = tombstone;
  return row;
}

/** A record as the app understands it, from a server row. */
export function fromServerRow(entity: 'categories', row: Record<string, unknown>, userId: Id): Category;
export function fromServerRow(entity: 'accounts', row: Record<string, unknown>, userId: Id): Account;
export function fromServerRow(entity: 'people', row: Record<string, unknown>, userId: Id): Person;
export function fromServerRow(entity: 'goals', row: Record<string, unknown>, userId: Id): Goal;
export function fromServerRow(entity: 'recurring_rules', row: Record<string, unknown>, userId: Id): RecurringRule;
export function fromServerRow(entity: 'budgets', row: Record<string, unknown>, userId: Id): Budget;
export function fromServerRow(entity: 'transactions', row: Record<string, unknown>, userId: Id): Transaction;
export function fromServerRow(entity: 'profiles', row: Record<string, unknown>, userId: Id, local?: Profile | null): Profile;
export function fromServerRow(entity: SyncEntity, row: Record<string, unknown>, userId: Id, local?: Profile | null): unknown {
  const out: Record<string, unknown> = { userId };
  for (const [d, s, kind] of SPECS[entity]) out[d] = normalise(row[s], kind ?? 'plain');
  if (entity === 'transactions') { out.updatedAt = iso(row.updated_at); out.version = Number(row.version); out.splits = row.splits ?? null; }
  if (entity === 'accounts') out.aliases = (row.aliases as string[] | null) ?? [];
  if (entity === 'profiles') {
    out.primaryGoals = (row.primary_goals as string[] | null) ?? [];
    out.defaultAccountId = local?.defaultAccountId ?? null; // a per-device preference: never overwritten by another device
  }
  return out;
}

/** True when a budget row from the server is a deletion marker. */
export const isTombstone = (entity: SyncEntity, row: Record<string, unknown>): boolean => entity === 'budgets' && row.deleted_at !== null && row.deleted_at !== undefined;
