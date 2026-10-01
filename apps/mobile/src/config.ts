/**
 * Build-time configuration from EXPO_PUBLIC_* variables (see apps/mobile/.env.example).
 * Everything here is public by design: the Supabase anon key only identifies the project, and what a user may do with it is
 * decided by row-level security and their own sign-in. No secret may ever be placed in an EXPO_PUBLIC_ variable.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const config = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  /** True only when the project URL and key are both present. Without them the app is local-only. */
  backendConfigured: /^https?:\/\//.test(url) && anonKey.length > 20,
  interpretUrl: url ? `${url}/functions/v1/interpret` : '',
  /** Deep link the OAuth and email-confirmation flows return to. Must match supabase/config.toml and app.json "scheme". */
  authRedirect: 'nomi://auth/callback',
} as const;
