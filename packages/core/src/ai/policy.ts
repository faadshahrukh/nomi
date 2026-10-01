import type { TransactionType } from '../types';

/** What the UI should do with a proposed transaction. */
export type Decision = 'clarify' | 'confirm' | 'one_tap' | 'auto_save';
export type ConfirmationPreference = 'always_confirm' | 'auto_save_high_confidence';

export const HIGH_CONFIDENCE = 0.9;
export const MEDIUM_CONFIDENCE = 0.7;
/** Default "high financial impact" line: BDT 10,000 in minor units. Per-user setting in production. */
export const DEFAULT_HIGH_IMPACT_MINOR = 1_000_000;

export interface PolicyInput {
  type: TransactionType; amountMinor: number | null; confidence: number;
  blockingIssue: boolean; amountNotInInput: boolean; hasWarnings: boolean; isShared: boolean;
  proposalCount: number; preference: ConfirmationPreference; highImpactMinor?: number;
}

/**
 * Confirmation policy (spec section 26):
 *  - missing/invalid critical data               -> clarify (ask one focused question)
 *  - amount not found in what the user said      -> confirm (explicit, shows what was heard)
 *  - high financial impact                       -> confirm (never auto, never one-tap)
 *  - confidence < 0.7                            -> clarify
 *  - 0.7 <= confidence < 0.9                     -> confirm (show interpretation, user taps Save)
 *  - confidence >= 0.9                           -> one_tap, or auto_save when ALL hold:
 *      user opted in, plain personal expense, no warnings, single proposal.
 */
export function decide(p: PolicyInput): Decision {
  if (p.blockingIssue || p.amountMinor == null) return 'clarify';
  if (p.amountNotInInput) return 'confirm';
  if (p.amountMinor >= (p.highImpactMinor ?? DEFAULT_HIGH_IMPACT_MINOR)) return 'confirm';
  if (p.confidence < MEDIUM_CONFIDENCE) return 'clarify';
  if (p.confidence < HIGH_CONFIDENCE) return 'confirm';
  const autoOk = p.preference === 'auto_save_high_confidence' && p.type === 'expense' && !p.isShared && !p.hasWarnings && p.proposalCount === 1;
  return autoOk ? 'auto_save' : 'one_tap';
}
