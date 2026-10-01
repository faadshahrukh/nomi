import { InterpretationSchema, type Interpretation } from './schema';
import type { InterpretInput, Interpreter, InterpreterKind } from './interpreterTypes';

export class InterpreterUnavailable extends Error { constructor(public reason: 'signed_out' | 'timeout' | 'network' | 'http' | 'invalid') { super(`interpreter unavailable: ${reason}`); this.name = 'InterpreterUnavailable'; } }

export interface HttpInterpreterConfig {
  /** Full URL of the interpret Edge Function. */
  url: string;
  /** The signed-in user's access token, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Supabase requires the project's public (anon) key as `apikey`. It is not a secret. */
  apiKey?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** Client for the server-side Claude interpreter. Holds no secrets: authentication is the user's own session token. */
export class HttpInterpreter implements Interpreter {
  readonly lastKind: InterpreterKind = 'model';
  constructor(private cfg: HttpInterpreterConfig) {}

  async interpret(input: InterpretInput): Promise<Interpretation> {
    const token = await this.cfg.getToken();
    if (!token) throw new InterpreterUnavailable('signed_out');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.cfg.timeoutMs ?? 8000);
    try {
      const res = await (this.cfg.fetchFn ?? fetch)(this.cfg.url, {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(this.cfg.apiKey ? { apikey: this.cfg.apiKey } : {}) },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new InterpreterUnavailable('http');
      const body = (await res.json()) as { interpretation?: unknown };
      const parsed = InterpretationSchema.safeParse(body.interpretation);
      if (!parsed.success) throw new InterpreterUnavailable('invalid');
      return parsed.data;
    } catch (e) {
      if (e instanceof InterpreterUnavailable) throw e;
      throw new InterpreterUnavailable((e as { name?: string })?.name === 'AbortError' ? 'timeout' : 'network');
    } finally { clearTimeout(timer); }
  }
}

/**
 * Tries the primary interpreter, and on ANY failure (offline, signed out, timeout, server error, off-schema reply) uses the fallback.
 * Capture therefore always works. `lastKind` says which one answered so the UI can be transparent about it.
 */
export class FallbackInterpreter implements Interpreter {
  lastKind: InterpreterKind = 'device';
  constructor(private primary: Interpreter, private fallback: Interpreter) {}

  async interpret(input: InterpretInput): Promise<Interpretation> {
    try {
      const out = await this.primary.interpret(input);
      this.lastKind = 'model';
      return out;
    } catch {
      this.lastKind = 'device';
      return this.fallback.interpret(input);
    }
  }
}
