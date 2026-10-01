import { currencyInfo, extractAmounts, type CurrencyCode } from './money';
import { defaultIncludeInLiquid, type Account, type AccountType, type Id } from './types';

export const ACCOUNT_TYPES: Array<{ type: AccountType; label: string }> = [
  { type: 'cash', label: 'Cash' }, { type: 'bank', label: 'Bank' }, { type: 'mobile_wallet', label: 'Mobile wallet' },
  { type: 'card', label: 'Card' }, { type: 'savings', label: 'Savings' },
];

/** A friendly default so the common case is one tap. Bangladesh gets bKash for wallets. */
export function suggestAccountName(type: AccountType, currency: CurrencyCode): string {
  switch (type) {
    case 'cash': return 'Cash';
    case 'bank': return 'Bank account';
    case 'mobile_wallet': return currency === 'BDT' ? 'bKash' : 'Mobile wallet';
    case 'card': return 'Card';
    case 'savings': return 'Savings';
    default: return 'Account';
  }
}

/** Words the user might say aloud for an account, so "using bkash" or "বিকাশ" finds it. */
export function defaultAliases(type: AccountType, name: string): string[] {
  const out = new Set<string>([name.trim().toLowerCase()]);
  if (type === 'cash') ['cash', 'নগদ টাকা'].forEach((a) => out.add(a));
  if (type === 'mobile_wallet' && /bkash|বিকাশ/i.test(name)) ['bkash', 'বিকাশ'].forEach((a) => out.add(a));
  if (type === 'mobile_wallet' && /nagad|নগদ/i.test(name)) ['nagad', 'নগদ'].forEach((a) => out.add(a));
  if (type === 'bank') out.add('bank');
  if (type === 'savings') out.add('savings');
  return [...out].filter(Boolean);
}

/** "" is zero. "5000", "5k", "1.5 lakh" and Bangla digits parse. Anything else, or a negative, is null. */
export function parseOpeningBalance(text: string, currency: CurrencyCode): number | null {
  const t = text.trim();
  if (!t) return 0;
  if (/^[-−]/.test(t)) return null;
  const found = extractAmounts(t, currency);
  if (found.length !== 1) return t.replace(/[.,\s]/g, '').match(/^[0০]+$/) ? 0 : null;
  // the whole text must be just the amount (with an optional currency word or sign), so "5000 and more" is rejected
  return /^[\s৳$€£₹]*[\d০-৯][\d০-৯,.]*\s*(?:k|thousand|lakhs?|lacs?|crores?|হাজার|লাখ|কোটি)?\s*(?:tk\.?|taka|bdt|টাকা|inr|usd|eur|gbp)?\s*$/i.test(t) ? found[0]! : null;
}

export type AccountIssue = 'name_required' | 'name_too_long' | 'name_taken' | 'balance_invalid';

export interface NewAccountInput { name: string; type: AccountType; balanceText: string }

export function validateNewAccount(input: NewAccountInput, existing: Account[], currency: CurrencyCode): { issues: AccountIssue[]; openingBalanceMinor: number | null } {
  const issues: AccountIssue[] = [];
  const name = input.name.trim();
  if (!name) issues.push('name_required');
  else if (name.length > 80) issues.push('name_too_long');
  else if (existing.some((a) => !a.archivedAt && a.name.trim().toLowerCase() === name.toLowerCase())) issues.push('name_taken');
  const openingBalanceMinor = parseOpeningBalance(input.balanceText, currency);
  if (openingBalanceMinor === null) issues.push('balance_invalid');
  return { issues, openingBalanceMinor };
}

export const ACCOUNT_ISSUE_MESSAGES: Record<AccountIssue, string> = {
  name_required: 'Give the account a name.',
  name_too_long: 'Use a shorter name (80 characters at most).',
  name_taken: 'You already have an account with that name.',
  balance_invalid: 'Enter the balance as a number, like 5000 or 5k. Leave it empty for zero.',
};

export function buildAccount(userId: Id, id: Id, input: NewAccountInput, currency: CurrencyCode, openingBalanceMinor: number): Account {
  currencyInfo(currency); // throws for an unsupported currency
  const name = input.name.trim();
  return { id, userId, name, type: input.type, currency, aliases: defaultAliases(input.type, name), openingBalanceMinor, includeInLiquid: defaultIncludeInLiquid(input.type), archivedAt: null };
}
