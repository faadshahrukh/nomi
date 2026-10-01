import { z } from 'zod';
import { InterpretationSchema } from '../schema.ts';
import type { Interpreter } from '../interpreterTypes.ts';
import { InterpreterError } from './claudeInterpreter.ts';
import { LIMITS } from './prompt.ts';

const name = z.string().min(1).max(LIMITS.name);
export const InterpretRequestSchema = z.object({
  text: z.string().min(1).max(LIMITS.text),
  locale: z.enum(['en', 'bn', 'mixed']),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  accounts: z.array(z.object({ name, aliases: z.array(name).max(LIMITS.aliases) })).max(LIMITS.accounts),
  categoryNames: z.array(name).max(LIMITS.categories),
  personNames: z.array(name).max(LIMITS.people),
  goalNames: z.array(name).max(LIMITS.goals),
}).strict();

export interface HandlerDeps {
  interpreter: Interpreter;
  /** Resolves the signed-in user from the request, or null. Verified server-side, never trusted from the body. */
  authenticate(req: Request): Promise<{ userId: string } | null>;
  /** Counts one use against the user's daily allowance. Returns false when it is used up. */
  consumeQuota(userId: string): Promise<boolean>;
  /** Receives event codes and timings only. Never request or response content. */
  log?(entry: { event: string; code?: string; ms?: number }): void;
  allowedOrigin?: string;
  now?: () => number;
}

export const MAX_BODY_BYTES = 16 * 1024;

/**
 * The Edge Function's logic, free of Deno and Supabase APIs so it can be tested. Order matters:
 * method, size, authentication, validation, quota, then the model call. Responses carry error codes, never content.
 */
export async function handleInterpret(req: Request, deps: HandlerDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  const headers: Record<string, string> = {
    'content-type': 'application/json', 'cache-control': 'no-store',
    'access-control-allow-origin': deps.allowedOrigin ?? '*', 'access-control-allow-headers': 'authorization, content-type, apikey', 'access-control-allow-methods': 'POST, OPTIONS',
  };
  const reply = (status: number, body: unknown, extra: Record<string, string> = {}) => {
    deps.log?.({ event: 'interpret', code: String(status), ms: now() - t0 });
    return new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return reply(413, { error: 'too_large' });

  const user = await deps.authenticate(req).catch(() => null);
  if (!user) return reply(401, { error: 'unauthorized' });

  let raw: string;
  try { raw = await req.text(); } catch { return reply(400, { error: 'bad_request' }); }
  if (raw.length > MAX_BODY_BYTES) return reply(413, { error: 'too_large' });
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return reply(400, { error: 'bad_request' }); }
  const body = InterpretRequestSchema.safeParse(json);
  if (!body.success) return reply(400, { error: 'bad_request' });

  const allowed = await deps.consumeQuota(user.userId).catch(() => false);
  if (!allowed) return reply(429, { error: 'quota_exceeded' });

  try {
    const interpretation = await deps.interpreter.interpret(body.data);
    const checked = InterpretationSchema.safeParse(interpretation); // belt and braces: never return anything off-schema
    if (!checked.success) return reply(502, { error: 'invalid_output' });
    return reply(200, { interpretation: checked.data });
  } catch (e) {
    const code = e instanceof InterpreterError ? e.code : 'upstream';
    if (code === 'rate_limited') return reply(503, { error: 'busy' }, { 'retry-after': '5' });
    if (code === 'refused') return reply(422, { error: 'refused' });
    return reply(502, { error: code === 'invalid_output' || code === 'truncated' ? code : 'upstream' });
  }
}
