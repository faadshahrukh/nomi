import { describe, expect, it, vi } from 'vitest';
import { chunkedStorage, type KeyValueStore } from './chunkedStorage';
import { mapAuthError } from './mapAuthError';
import { createSupabaseAuth, notConfiguredAuth, type OpenAuthSession, type SupabaseLike } from './supabaseAuth';
import { AUTH_MESSAGES, AuthError, type AuthErrorCode } from './types';

const sbSession = { access_token: 'tok', user: { id: 'u1', email: 'a@b.co' } };
const ok = <T>(data: T) => Promise.resolve({ data, error: null });
const bad = (error: unknown) => Promise.resolve({ data: { session: null, user: null, url: null } as never, error });

function fake(over: Partial<SupabaseLike['auth']> = {}, rpc: SupabaseLike['rpc'] = async () => ({ error: null })) {
  const unsubscribe = vi.fn();
  const auth: SupabaseLike['auth'] = {
    getSession: () => ok({ session: sbSession }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
    signUp: vi.fn(() => ok({ user: {}, session: null })),
    signInWithPassword: vi.fn(() => ok({ session: sbSession })),
    signInWithOAuth: vi.fn(() => ok({ url: 'https://proj.supabase.co/auth/v1/authorize?provider=google' })),
    exchangeCodeForSession: vi.fn(() => ok({ session: sbSession })),
    resetPasswordForEmail: vi.fn(() => ok({})),
    signOut: vi.fn(async () => ({ error: null })),
    ...over,
  };
  const client: SupabaseLike = { auth, rpc: vi.fn(rpc) as never };
  return { client, auth, unsubscribe };
}
const open = (r: Awaited<ReturnType<OpenAuthSession>>): OpenAuthSession => vi.fn(async () => r);
const svc = (f: ReturnType<typeof fake>, o: OpenAuthSession = open({ type: 'cancel' })) => createSupabaseAuth(f.client, { redirectTo: 'nomi://auth/callback', openAuthSession: o });

describe('error mapping', () => {
  it.each<[unknown, AuthErrorCode]>([
    [{ code: 'invalid_credentials', status: 400 }, 'invalid_credentials'],
    [{ code: 'email_not_confirmed', status: 400 }, 'email_not_confirmed'],
    [{ code: 'user_already_exists', status: 422 }, 'email_in_use'],
    [{ code: 'weak_password', status: 422 }, 'weak_password'],
    [{ code: 'email_address_invalid', status: 400 }, 'invalid_email'],
    [{ code: 'over_request_rate_limit', status: 429 }, 'rate_limited'],
    [{ status: 429 }, 'rate_limited'],
    [{ name: 'AuthRetryableFetchError', status: 0 }, 'network'],
    [new TypeError('Network request failed'), 'network'],
    [{ code: 'something_new', status: 500 }, 'unknown'],
    [null, 'unknown'],
  ])('%j -> %s', (e, code) => { expect(mapAuthError(e).code).toBe(code); });
  it('every code has a safe, plain message and none echo input', () => {
    for (const code of Object.keys(AUTH_MESSAGES) as AuthErrorCode[]) expect(AUTH_MESSAGES[code].length).toBeGreaterThan(10);
    expect(mapAuthError({ code: 'invalid_credentials', message: 'User jane@x.com not found' }).message).not.toContain('jane');
    expect(mapAuthError(new AuthError('cancelled')).code).toBe('cancelled'); // already mapped errors pass through
  });
});

describe('Supabase auth adapter', () => {
  it('restores a saved session and reports changes, with an unsubscribe', async () => {
    const f = fake();
    expect(await svc(f).getSession()).toEqual({ accessToken: 'tok', user: { id: 'u1', email: 'a@b.co' } });
    const listener = vi.fn();
    const off = svc(f).onChange(listener);
    (f.auth.onAuthStateChange as ReturnType<typeof vi.fn>).mock.calls[0]![0]('SIGNED_OUT', null);
    expect(listener).toHaveBeenCalledWith(null);
    off(); expect(f.unsubscribe).toHaveBeenCalled();
    expect(await svc(fake({ getSession: () => ok({ session: null }) })).getSession()).toBeNull();
  });
  it('signs in with email, trimming the address, and maps failures', async () => {
    const f = fake();
    const s = await svc(f).signInWithEmail('  a@b.co ', 'password1');
    expect(s.accessToken).toBe('tok');
    expect(f.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'password1' });
    await expect(svc(fake({ signInWithPassword: () => bad({ code: 'invalid_credentials' }) })).signInWithEmail('a@b.co', 'x')).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(svc(fake({ signInWithPassword: () => ok({ session: null }) })).signInWithEmail('a@b.co', 'x')).rejects.toMatchObject({ code: 'unknown' });
  });
  it('signs up and asks for email confirmation, never revealing whether an address already exists', async () => {
    const f = fake();
    expect(await svc(f).signUpWithEmail('new@b.co', 'password1')).toEqual({ needsEmailConfirmation: true });
    expect(f.auth.signUp).toHaveBeenCalledWith({ email: 'new@b.co', password: 'password1', options: { emailRedirectTo: 'nomi://auth/callback' } });
    expect(await svc(fake({ signUp: () => ok({ user: {}, session: sbSession }) })).signUpWithEmail('a@b.co', 'password1')).toEqual({ needsEmailConfirmation: false });
    await expect(svc(fake({ signUp: () => bad({ code: 'weak_password' }) })).signUpWithEmail('a@b.co', '1')).rejects.toMatchObject({ code: 'weak_password' });
  });
  it('signs in with Google through the system browser using the code flow', async () => {
    const f = fake();
    const o = open({ type: 'success', url: 'nomi://auth/callback?code=abc123' });
    const s = await svc(f, o).signInWithGoogle();
    expect(s.user.id).toBe('u1');
    expect(f.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'nomi://auth/callback', skipBrowserRedirect: true } });
    expect(o).toHaveBeenCalledWith('https://proj.supabase.co/auth/v1/authorize?provider=google', 'nomi://auth/callback');
    expect(f.auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
  });
  it('treats a closed browser, a denied consent, a missing code or a bad exchange as clean failures', async () => {
    await expect(svc(fake(), open({ type: 'cancel' })).signInWithGoogle()).rejects.toMatchObject({ code: 'cancelled' });
    await expect(svc(fake(), open({ type: 'dismiss' })).signInWithGoogle()).rejects.toMatchObject({ code: 'cancelled' });
    await expect(svc(fake(), open({ type: 'success', url: 'nomi://auth/callback?error=access_denied' })).signInWithGoogle()).rejects.toMatchObject({ code: 'cancelled' });
    await expect(svc(fake(), open({ type: 'success', url: 'nomi://auth/callback?error=server_error' })).signInWithGoogle()).rejects.toMatchObject({ code: 'unknown' });
    await expect(svc(fake(), open({ type: 'success', url: 'nomi://auth/callback' })).signInWithGoogle()).rejects.toMatchObject({ code: 'unknown' });
    await expect(svc(fake({ exchangeCodeForSession: () => bad({ code: 'invalid_grant' }) }), open({ type: 'success', url: 'nomi://auth/callback?code=x' })).signInWithGoogle()).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(svc(fake({ signInWithOAuth: () => ok({ url: null }) })).signInWithGoogle()).rejects.toMatchObject({ code: 'unknown' });
    const throwing: OpenAuthSession = async () => { throw new Error('browser unavailable'); };
    await expect(svc(fake(), throwing).signInWithGoogle()).rejects.toMatchObject({ code: 'cancelled' });
  });
  it('sends a password reset, signs out locally, and deletes the account then clears the local session', async () => {
    const f = fake();
    await svc(f).sendPasswordReset(' a@b.co ');
    expect(f.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.co', { redirectTo: 'nomi://auth/callback' });
    await svc(f).signOut();
    expect(f.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    await svc(f).deleteAccount();
    expect(f.client.rpc).toHaveBeenCalledWith('delete_my_account');
    expect(f.auth.signOut).toHaveBeenCalledTimes(2);
    const g = fake({}, async () => ({ error: { status: 500 } }));
    await expect(svc(g).deleteAccount()).rejects.toBeInstanceOf(AuthError);
    expect(g.auth.signOut).not.toHaveBeenCalled(); // a failed deletion must not look like a success
  });
  it('the not-configured stand-in lets the app run locally and explains itself', async () => {
    expect(await notConfiguredAuth.getSession()).toBeNull();
    await expect(notConfiguredAuth.signInWithEmail('a', 'b')).rejects.toMatchObject({ code: 'not_configured' });
    await expect(notConfiguredAuth.signInWithGoogle()).rejects.toMatchObject({ code: 'not_configured' });
    await expect(notConfiguredAuth.deleteAccount()).rejects.toMatchObject({ code: 'not_configured' });
    await expect(notConfiguredAuth.signOut()).resolves.toBeUndefined();
  });
});

describe('chunked secure storage', () => {
  const mem = () => { const m = new Map<string, string>(); const store: KeyValueStore = { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => { m.set(k, v); }, removeItem: async (k) => { m.delete(k); } }; return { m, store }; };
  it('round-trips values far larger than one secure-store entry, none of which exceed the limit', async () => {
    const { m, store } = mem();
    const s = chunkedStorage(store, 1800);
    const session = JSON.stringify({ access_token: 'a'.repeat(3000), refresh_token: 'r'.repeat(600), user: { id: 'u', email: 'x@y.z' } });
    await s.setItem('sb-session', session);
    expect(await s.getItem('sb-session')).toBe(session);
    expect(Math.max(...[...m.values()].map((v) => v.length))).toBeLessThanOrEqual(1800);
    expect(m.size).toBeGreaterThan(2);
  });
  it('replaces and removes cleanly, leaving no stale pieces behind', async () => {
    const { m, store } = mem();
    const s = chunkedStorage(store, 10);
    await s.setItem('k', 'x'.repeat(95)); await s.setItem('k', 'short');
    expect(await s.getItem('k')).toBe('short');
    expect([...m.keys()].sort()).toEqual(['k.0', 'k.n']);
    await s.removeItem('k');
    expect(m.size).toBe(0);
    expect(await s.getItem('k')).toBeNull();
  });
  it('treats a partly written value as no session instead of a corrupt one', async () => {
    const { m, store } = mem();
    const s = chunkedStorage(store, 10);
    await s.setItem('k', 'abcdefghijklmnopqrstuvwxyz');
    m.delete('k.1');
    expect(await s.getItem('k')).toBeNull();
  });
});
