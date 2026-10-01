import type { Transaction } from '../types';

/** Fields that change what the numbers mean. If these differ between two devices, a person decides. */
const MATERIAL: Array<keyof Transaction> = ['type', 'amountMinor', 'currency', 'localDate', 'accountId', 'toAccountId', 'paidBy', 'splits', 'counterpartyId',
  'debtDirection', 'repaymentDirection', 'goalId', 'recurringRuleId', 'occurrenceDate', 'deletedAt'];
/** Descriptive fields. Differences here do not change any balance or total. */
const SOFT: Array<keyof Transaction> = ['categoryId', 'merchantName', 'notes', 'localTime', 'source', 'aiConfidence', 'rawInput'];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type Resolution =
  | { kind: 'same' }
  | { kind: 'merge'; merged: Transaction }
  | { kind: 'review' };

/**
 * Two devices changed the same transaction. What can be decided without asking:
 *  - nothing really differs: just adopt the server's version number;
 *  - only descriptive fields differ (category, merchant, note): keep this device's wording and the server's numbers, because the
 *    person who is syncing now made a deliberate edit and nothing financial is at stake;
 *  - anything that moves money differs (amount, date, account, split, deleted or not): never pick a side silently. The server's copy
 *    stays in the ledger and this device's version is kept aside for the person to choose.
 */
export function resolveTransactionConflict(local: Transaction, remote: Transaction): Resolution {
  if (MATERIAL.some((k) => !same(local[k], remote[k]))) return { kind: 'review' };
  if (SOFT.every((k) => same(local[k], remote[k]))) return { kind: 'same' };
  const merged = { ...remote } as Record<string, unknown>;
  for (const k of SOFT) merged[k] = local[k];
  return { kind: 'merge', merged: merged as unknown as Transaction };
}
