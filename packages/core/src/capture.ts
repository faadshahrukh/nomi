import { resolveInterpretation, type ResolvedCapture, type ResolveContext } from './ai/resolve';
import type { Interpreter, InterpreterKind } from './ai';
import { todayIn } from './dates';
import type { LedgerSnapshot } from './homeSummary';

export type CaptureOutcome = ResolvedCapture | { status: 'unavailable' };
/** A capture outcome plus which interpreter understood it, so the UI can be open about where the reading came from. */
export type CaptureResult = CaptureOutcome & { interpretedBy: InterpreterKind | null };

const BANGLA = /[ঀ-৿]/;
const LATIN = /[A-Za-z]/;
export const detectLocale = (text: string): 'en' | 'bn' | 'mixed' =>
  BANGLA.test(text) ? (LATIN.test(text) ? 'mixed' : 'bn') : 'en';

/**
 * Conversational capture, minus any UI: text in, validated proposals out.
 * interpret (any Interpreter) -> schema check -> deterministic resolution -> confirmation policy.
 * Nothing here writes to the ledger; saving is a separate, explicit step through TransactionService.
 * If the interpreter fails or is offline the outcome is `unavailable`, never a guess.
 */
export async function captureText(input: {
  text: string; source: 'text' | 'voice'; snapshot: LedgerSnapshot; interpreter: Interpreter; now: Date;
}): Promise<CaptureResult> {
  const { text, snapshot: s, interpreter } = input;
  const today = todayIn(s.profile.timezone, input.now);
  const accounts = s.accounts.filter((a) => !a.archivedAt);
  let raw: unknown;
  try {
    raw = await interpreter.interpret({
      text, locale: detectLocale(text), today, currency: s.profile.currency,
      accounts: accounts.map((a) => ({ name: a.name, aliases: a.aliases })),
      categoryNames: s.categories.filter((c) => !c.archivedAt).map((c) => c.name),
      personNames: s.people.map((p) => p.name), goalNames: s.goals.map((g) => g.name),
    });
  } catch {
    return { status: 'unavailable', interpretedBy: null };
  }
  const ctx: ResolveContext = {
    userId: s.profile.userId, rawText: text, today, defaultCurrency: s.profile.currency,
    accounts: s.accounts, categories: s.categories, people: s.people, goals: s.goals,
    defaultAccountId: s.profile.defaultAccountId, source: input.source,
    preference: s.profile.confirmationPref, highImpactMinor: s.profile.highImpactMinor,
  };
  return { ...resolveInterpretation(raw, ctx), interpretedBy: interpreter.lastKind ?? null };
}
