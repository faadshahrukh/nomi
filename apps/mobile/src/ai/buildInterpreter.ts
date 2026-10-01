import { FallbackInterpreter, HttpInterpreter, RuleBasedInterpreter, type Interpreter } from '@nomi/core';

export interface InterpreterChoice {
  /** The user's privacy setting. */
  aiProcessing: boolean;
  backendConfigured: boolean;
  signedIn: boolean;
  interpretUrl: string;
  anonKey: string;
  getToken: () => Promise<string | null>;
  fetchFn?: typeof fetch;
}

/**
 * Decides who understands the user's message.
 *  - AI service (with the on-device rules as the safety net) only when ALL hold: the user allows AI processing, a backend is
 *    configured, and they are signed in. Anything else means the text never leaves the device.
 *  - Otherwise the on-device rule-based interpreter.
 */
export function buildInterpreter(c: InterpreterChoice): Interpreter {
  const rules = new RuleBasedInterpreter();
  if (!c.aiProcessing || !c.backendConfigured || !c.signedIn) return rules;
  return new FallbackInterpreter(new HttpInterpreter({ url: c.interpretUrl, getToken: c.getToken, apiKey: c.anonKey, fetchFn: c.fetchFn }), rules);
}
