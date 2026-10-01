import { findRegion, type Region } from './regions';
import type { Id, Profile } from './types';

export const PRIMARY_GOALS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'track_spending', label: 'Track my spending', hint: 'Know where my money goes' },
  { key: 'save_money', label: 'Save more', hint: 'Put money aside for what matters' },
  { key: 'budget', label: 'Stick to a budget', hint: 'Stay within a monthly limit' },
  { key: 'split_with_friends', label: 'Split costs with friends', hint: 'Keep track of who owes who' },
  { key: 'understand_habits', label: 'Understand my habits', hint: 'See what changes and why' },
];
export const isPrimaryGoal = (k: string) => PRIMARY_GOALS.some((g) => g.key === k);

/** A starting profile for a new user in a region. Nothing is saved until the caller stores it. */
export function buildProfile(userId: Id, region: Region, opts: { displayName?: string | null; timezone?: string } = {}, existing?: Profile | null): Profile {
  const name = opts.displayName?.trim().slice(0, 60) || null;
  return {
    userId, country: region.code, currency: region.currency, timezone: opts.timezone || region.timezone, locale: region.locale,
    confirmationPref: existing?.confirmationPref ?? 'always_confirm',
    highImpactMinor: existing?.highImpactMinor ?? defaultHighImpact(region),
    safetyBufferMinor: existing?.safetyBufferMinor ?? 0, retainRawInput: existing?.retainRawInput ?? false,
    defaultAccountId: existing?.defaultAccountId ?? null, aiProcessing: existing?.aiProcessing ?? true,
    displayName: name ?? existing?.displayName ?? null, primaryGoals: existing?.primaryGoals ?? [], onboardedAt: existing?.onboardedAt ?? null,
  };
}

/** "High financial impact" (always confirmed, never auto-saved) is roughly a day's wages: 10,000 BDT, and a comparable amount elsewhere. */
function defaultHighImpact(region: Region): number {
  const major: Record<string, number> = { BDT: 10_000, INR: 10_000, USD: 200, GBP: 150, EUR: 200 };
  return (major[region.currency] ?? 200) * 100;
}

export const regionOrDefault = (code: string | undefined): Region => findRegion(code ?? '') ?? findRegion('BD')!;
