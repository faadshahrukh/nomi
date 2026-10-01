import type { Interpretation } from './schema.ts';

export interface InterpretInput {
  text: string; locale: 'en' | 'bn' | 'mixed'; today: string; currency: string;
  accounts: Array<{ name: string; aliases: string[] }>;
  categoryNames: string[]; personNames: string[]; goalNames: string[];
}

/** Which kind of interpreter produced a result, so the app can say so ("Understood on this device"). */
export type InterpreterKind = 'model' | 'device';

/**
 * Port for turning language into a structured proposal. Implementations:
 *  - RuleBasedInterpreter: on-device, offline, deterministic. Covers common phrasings; the fallback when no model is reachable.
 *  - ClaudeInterpreter: runs server-side only (the API key never reaches the app); the app reaches it through HttpInterpreter.
 * Whatever an interpreter returns is validated by resolveInterpretation. An interpreter can never write to the ledger.
 */
export interface Interpreter {
  interpret(input: InterpretInput): Promise<Interpretation>;
  /** Which implementation served the most recent call. */
  readonly lastKind?: InterpreterKind;
}
