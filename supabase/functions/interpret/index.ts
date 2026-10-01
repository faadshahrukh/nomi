// Edge Function: POST /functions/v1/interpret
// Turns a sentence into a structured proposal with Claude. All logic lives in packages/core (tested without Deno or Supabase);
// this file only wires in the real services. The Anthropic key exists only here, as a function secret, never in the app.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { ClaudeInterpreter, type MessagesClient } from '../../../packages/core/src/ai/claude/claudeInterpreter.ts';
import { handleInterpret } from '../../../packages/core/src/ai/claude/handler.ts';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const env = (k: string) => Deno.env.get(k);
const url = env('SUPABASE_URL');
const anonKey = env('SUPABASE_ANON_KEY');
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
const anthropicKey = env('ANTHROPIC_API_KEY');

if (!url || !anonKey || !serviceKey || !anthropicKey) {
  // Fail closed and say nothing about which setting is missing.
  Deno.serve(() => new Response(JSON.stringify({ error: 'not_configured' }), { status: 503, headers: { 'content-type': 'application/json' } }));
} else {
  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const interpreter = new ClaudeInterpreter(
    new Anthropic({ apiKey: anthropicKey, maxRetries: 2, timeout: 20_000 }) as unknown as MessagesClient,
    { model: env('INTERPRETER_MODEL') || undefined, fallbacks: env('INTERPRETER_FALLBACKS') !== '0' },
  );
  const dailyLimit = Number(env('INTERPRETER_DAILY_LIMIT') ?? 200);

  Deno.serve((req) => handleInterpret(req, {
    interpreter,
    // The access token is verified by Supabase Auth. The user id comes from that, never from the request body.
    authenticate: async (r) => {
      const token = r.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) return null;
      const { data, error } = await authClient.auth.getUser(token);
      return error || !data.user ? null : { userId: data.user.id };
    },
    aiEnabled: async (userId) => {
      const { data } = await admin.from('profiles').select('ai_processing').eq('user_id', userId).maybeSingle();
      return data?.ai_processing !== false; // no profile yet means the default: allowed
    },
    consumeQuota: async (userId) => {
      const { data, error } = await admin.rpc('consume_ai_quota', { p_user: userId, p_limit: dailyLimit });
      return !error && data === true;
    },
    // Event codes and timings only. Never request or response content.
    log: (entry) => console.log(JSON.stringify(entry)),
    allowedOrigin: env('ALLOWED_ORIGIN') || undefined,
  }));
}
