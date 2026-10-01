export * from './schema';
export * from './policy';
export * from './resolve';

import type { Interpretation } from './schema';

/**
 * Port for the language model. The production adapter runs server-side (the API key never ships in the app),
 * sends only names and the raw text (never balances), and must return an object matching InterpretationSchema.
 */
export interface Interpreter {
  interpret(input: { text: string; locale: 'en' | 'bn' | 'mixed'; today: string; accountNames: string[]; categoryNames: string[]; personNames: string[]; goalNames: string[] }): Promise<Interpretation>;
}
