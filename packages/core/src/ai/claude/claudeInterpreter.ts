import { InterpretationSchema, type Interpretation } from '../schema.ts';
import type { InterpretInput, Interpreter, InterpreterKind } from '../interpreterTypes.ts';
import { INTERPRETATION_JSON_SCHEMA, SYSTEM_PROMPT, buildUserMessage, sanitizeInput } from './prompt.ts';

/** The slice of the Anthropic SDK this class uses. The real client (new Anthropic({ apiKey })) satisfies it; tests pass a stub. */
export interface ClaudeMessage { content: Array<{ type: string; text?: string }>; stop_reason: string | null }
export interface MessagesClient {
  messages: { create(params: Record<string, unknown>): Promise<ClaudeMessage> };
  beta?: { messages: { create(params: Record<string, unknown>): Promise<ClaudeMessage> } };
}

export type InterpreterErrorCode = 'refused' | 'truncated' | 'invalid_output' | 'rate_limited' | 'upstream' | 'auth' | 'bad_request';

/** Carries only a code. Never the model's text or the user's, so it is always safe to log and to return. */
export class InterpreterError extends Error {
  constructor(public code: InterpreterErrorCode) { super(`interpreter: ${code}`); this.name = 'InterpreterError'; }
}

export interface ClaudeInterpreterOptions {
  /** Default is the current Opus. A smaller model is a cost decision for the product owner, set via INTERPRETER_MODEL. */
  model?: string;
  /** Structured extraction needs little deliberation. Opus 5.5 defaults to "medium" and cannot disable thinking, so say it explicitly. */
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  /** Ask the API to re-run a request on a fallback model if a safety classifier declines it. Retried without it if the API rejects the parameter. */
  fallbacks?: boolean;
}

export const DEFAULT_MODEL = 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const statusOf = (e: unknown): number | undefined => (typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : undefined);

function toInterpreterError(e: unknown): InterpreterError {
  if (e instanceof InterpreterError) return e;
  const s = statusOf(e);
  if (s === 429) return new InterpreterError('rate_limited');
  if (s === 401 || s === 403) return new InterpreterError('auth');
  if (s === 400 || s === 404 || s === 413 || s === 422) return new InterpreterError('bad_request');
  return new InterpreterError('upstream'); // 5xx, timeouts, connection errors
}

/**
 * Turns a sentence into an Interpretation using Claude with structured (JSON schema) output. Server-side only.
 * What it guarantees: only sanitized names and the user's sentence are sent; the response is parsed and validated against
 * InterpretationSchema before it is returned; refusals and truncations become errors, never partial results.
 * The SDK retries 429 and 5xx responses itself.
 */
export class ClaudeInterpreter implements Interpreter {
  readonly lastKind: InterpreterKind = 'model';
  constructor(private client: MessagesClient, private opts: ClaudeInterpreterOptions = {}) {}

  private async send(params: Record<string, unknown>, fallbacks: boolean): Promise<ClaudeMessage> {
    if (fallbacks && this.client.beta) return this.client.beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' });
    return this.client.messages.create(params);
  }

  async interpret(input: InterpretInput): Promise<Interpretation> {
    const clean = sanitizeInput(input);
    if (!clean.text) return { status: 'not_a_transaction', transactions: [] };
    const params: Record<string, unknown> = {
      model: this.opts.model ?? DEFAULT_MODEL,
      max_tokens: this.opts.maxTokens ?? 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(clean) }],
      output_config: { effort: this.opts.effort ?? 'low', format: { type: 'json_schema', schema: INTERPRETATION_JSON_SCHEMA } },
    };
    const wantFallbacks = this.opts.fallbacks ?? true;
    let message: ClaudeMessage;
    try {
      try { message = await this.send(params, wantFallbacks); }
      catch (e) {
        if (!(wantFallbacks && statusOf(e) === 400)) throw e;
        message = await this.send(params, false); // the fallback parameter was rejected: try the plain request once
      }
    } catch (e) { throw toInterpreterError(e); }

    if (message.stop_reason === 'refusal') throw new InterpreterError('refused');
    if (message.stop_reason === 'max_tokens') throw new InterpreterError('truncated');
    const text = message.content.find((b) => b.type === 'text')?.text;
    if (!text) throw new InterpreterError('invalid_output');
    let json: unknown;
    try { json = JSON.parse(text); } catch { throw new InterpreterError('invalid_output'); }
    const parsed = InterpretationSchema.safeParse(json);
    if (!parsed.success) throw new InterpreterError('invalid_output');
    return parsed.data;
  }
}
