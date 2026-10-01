export interface AuthUser { id: string; email: string | null }
export interface AuthSession { accessToken: string; user: AuthUser }

/** Safe, user-facing categories. Raw provider messages are never shown, because they can echo the email address or internal detail. */
export type AuthErrorCode =
  | 'invalid_credentials' | 'email_not_confirmed' | 'email_in_use' | 'weak_password' | 'invalid_email'
  | 'rate_limited' | 'network' | 'cancelled' | 'not_configured' | 'unknown';

export class AuthError extends Error {
  constructor(public code: AuthErrorCode) { super(`auth: ${code}`); this.name = 'AuthError'; }
}

export const AUTH_MESSAGES: Record<AuthErrorCode, string> = {
  invalid_credentials: 'That email and password do not match. Check them and try again.',
  email_not_confirmed: 'Please confirm your email first. We sent you a link.',
  email_in_use: 'An account with this email already exists. Try signing in instead.',
  weak_password: 'Choose a longer password (at least 8 characters).',
  invalid_email: 'Enter a valid email address.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  network: "Can't reach the server. Check your connection and try again.",
  cancelled: 'Sign-in was cancelled.',
  not_configured: 'Sign-in is not set up in this build.',
  unknown: 'Something went wrong. Please try again.',
};

/**
 * Port for sign-in. The app depends on this, never on Supabase directly, so the screens and tests do not care which
 * backend sits behind it. Methods throw AuthError with a safe code.
 */
export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  onChange(listener: (session: AuthSession | null) => void): () => void;
  signUpWithEmail(email: string, password: string): Promise<{ needsEmailConfirmation: boolean }>;
  signInWithEmail(email: string, password: string): Promise<AuthSession>;
  signInWithGoogle(): Promise<AuthSession>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
  /** Permanently deletes the account and all server-side data. */
  deleteAccount(): Promise<void>;
}
