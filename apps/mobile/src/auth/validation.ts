export const isEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) && s.trim().length <= 254;

export type PasswordProblem = 'too_short' | 'too_long';
/** Supabase accepts longer, but 8 is the floor we enforce up front. 72 is the most bcrypt-based stores read. */
export function passwordProblem(p: string): PasswordProblem | null {
  if (p.length < 8) return 'too_short';
  if (p.length > 72) return 'too_long';
  return null;
}

export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  too_short: 'Use at least 8 characters.',
  too_long: 'Use 72 characters or fewer.',
};
