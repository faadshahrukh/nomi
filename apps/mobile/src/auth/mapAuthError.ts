import { AuthError, type AuthErrorCode } from './types';

/** Translates a Supabase auth error (or a thrown network failure) into a safe code. Matches on codes and status, not on message text. */
export function mapAuthError(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const err = e as { code?: string; status?: number; name?: string; message?: string } | null;
  const code = err?.code ?? '';
  const status = err?.status;
  const table: Array<[RegExp, AuthErrorCode]> = [
    [/invalid_credentials|invalid_grant/, 'invalid_credentials'],
    [/email_not_confirmed/, 'email_not_confirmed'],
    [/user_already_exists|email_exists|identity_already_exists/, 'email_in_use'],
    [/weak_password/, 'weak_password'],
    [/validation_failed|email_address_invalid|invalid_email/, 'invalid_email'],
    [/over_request_rate_limit|over_email_send_rate_limit|too_many/, 'rate_limited'],
  ];
  for (const [re, c] of table) if (re.test(code)) return new AuthError(c);
  if (status === 429) return new AuthError('rate_limited');
  if (status === 400 || status === 401) return new AuthError('invalid_credentials');
  if (status === 422) return new AuthError('weak_password');
  if (err?.name === 'AuthRetryableFetchError' || err?.name === 'TypeError' || status === 0 || status === undefined && /network|fetch|timeout/i.test(err?.message ?? '')) return new AuthError('network');
  return new AuthError('unknown');
}
