export * from './schema';
export * from './policy';
export * from './resolve';
export * from './ruleInterpreter';

import type { Interpretation } from './schema';

export interface InterpretInput {
  text: string; locale: 'en' | 'bn' | 'mixed'; today: string; currency: string;
  accounts: Array<{ name: string; aliases: string[] }>;
  categoryNames: string[]; personNames: string[]; goalNames: string[];
}

/**
 * Port for turning language into a structured proposal. Implementations:
 *  - RuleBasedInterpreter (built): on-device, offline, deterministic. Covers the common phrasings; the fallback when no model is reachable.
 *  - A Claude adapter (planned, milestone 5): runs server-side, never sees balances, returns the same schema.
 * Whatever it returns is validated by resolveInterpretation; an interpreter can never write to the ledger.
 */
export interface Interpreter {
  interpret(input: InterpretInput): Promise<Interpretation>;
}
