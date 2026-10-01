import type { Goal, Transaction } from './types';

/** Amount saved toward a goal: its opening amount plus every non-deleted contribution to it. */
export function goalSavedMinor(goal: Goal, txs: Transaction[]): number {
  return goal.openingSavedMinor + txs
    .filter((t) => !t.deletedAt && t.type === 'goal_contribution' && t.goalId === goal.id)
    .reduce((s, t) => s + t.amountMinor, 0);
}
