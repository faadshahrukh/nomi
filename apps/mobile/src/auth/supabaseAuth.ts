import { AuthError, type AuthService, type AuthSession } from './types';
import { mapAuthError } from './mapAuthError';

/** The slice of the Supabase client this adapter uses. The real client satisfies it; tests pass a stub. */
interface SbSession { access_token: string; user: { id: string; email?: string | null } }
type SbResult<T> = Promise<{ data: T; error: unknown }>;
export interface SupabaseLike {
  auth: {
    getSession(): SbResult<{ session: SbSession | null }>;
    onAuthStateChange(cb: (event: string, session: SbSession | null) => void): { data: { subscription: { unsubscribe(): void } } };
    signUp(args: { email: string; password: string; options?: { emailRedirectTo?: string } }): SbResult<{ user: unknown; session: SbSession | null }>;
    signInWithPassword(args: { email: string; password: string }): SbResult<{ session: SbSession | null }>;
    signInWithOAuth(args: { provider: 'google'; options: { redirectTo: string; skipBrowserRedirect: boolean } }): SbResult<{ url: string | null }>;
    exchangeCodeForSession(code: string): SbResult<{ session: SbSession | null }>;
    resetPasswordForEmail(email: string, options?: { redirectTo?: string }): SbResult<unknown>;
    signOut(options?: { scope?: 'local' | 'global' }): Promise<{ error: unknown }>;
  };
  rpc(fn: 'delete_my_account'): PromiseLike<{ error: unknown }>;
}

export type OpenAuthSession = (url: string, redirectTo: string) => Promise<{ type: 'success'; url: string } | { type: 'cancel' | 'dismiss' | 'locked' }>;

const toSession = (s: SbSession | null | undefined): AuthSession | null => (s ? { accessToken: s.access_token, user: { id: s.user.id, email: s.user.email ?? null } } : null);
const fail = (error: unknown): never => { throw mapAuthError(error); };

/**
 * Email + password and Google sign-in on Supabase Auth.
 * Google uses Supabase's hosted OAuth flow in the system browser (PKCE), so it needs only a Google web client configured in
 * the Supabase dashboard, works in Expo Go, and puts no Google SDK in the app.
 */
export function createSupabaseAuth(client: SupabaseLike, deps: { redirectTo: string; openAuthSession: OpenAuthSession }): AuthService {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) fail(error);
      return toSession(data.session);
    },
    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, s) => listener(toSession(s)));
      return () => data.subscription.unsubscribe();
    },
    async signUpWithEmail(email, password) {
      const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: deps.redirectTo } });
      if (error) fail(error);
      // With email confirmation on there is no session yet. An already-registered address looks identical on purpose
      // (the server hides whether an account exists), so we never reveal it either.
      return { needsEmailConfirmation: data.session === null };
    },
    async signInWithEmail(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) fail(error);
      const s = toSession(data.session);
      if (!s) throw new AuthError('unknown');
      return s;
    },
    async signInWithGoogle() {
      const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: deps.redirectTo, skipBrowserRedirect: true } });
      if (error || !data.url) return fail(error ?? new Error('no url'));
      const result = await deps.openAuthSession(data.url, deps.redirectTo).catch(() => ({ type: 'cancel' as const }));
      if (result.type !== 'success') throw new AuthError('cancelled');
      const params = new URL(result.url.replace('#', '?'));
      if (params.searchParams.get('error')) throw new AuthError(params.searchParams.get('error') === 'access_denied' ? 'cancelled' : 'unknown');
      const code = params.searchParams.get('code');
      if (!code) throw new AuthError('unknown');
      const ex = await client.auth.exchangeCodeForSession(code);
      if (ex.error) fail(ex.error);
      const s = toSession(ex.data.session);
      if (!s) throw new AuthError('unknown');
      return s;
    },
    async sendPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: deps.redirectTo });
      if (error) fail(error); // success looks the same whether or not the address exists
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) fail(error);
    },
    async deleteAccount() {
      const { error } = await client.rpc('delete_my_account');
      if (error) fail(error);
      await client.auth.signOut({ scope: 'local' });
    },
  };
}

/** Used when no backend is configured: the app runs locally and every sign-in attempt explains why it cannot happen. */
export const notConfiguredAuth: AuthService = {
  getSession: async () => null,
  onChange: () => () => undefined,
  signUpWithEmail: async () => { throw new AuthError('not_configured'); },
  signInWithEmail: async () => { throw new AuthError('not_configured'); },
  signInWithGoogle: async () => { throw new AuthError('not_configured'); },
  sendPasswordReset: async () => { throw new AuthError('not_configured'); },
  signOut: async () => undefined,
  deleteAccount: async () => { throw new AuthError('not_configured'); },
};
