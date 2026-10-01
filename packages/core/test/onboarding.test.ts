import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_ISSUE_MESSAGES, ACCOUNT_TYPES, CURRENCIES, PRIMARY_GOALS, REGIONS, buildAccount, buildProfile, defaultAliases, findRegion, formatMoney, hasSupportedCurrency,
  parseOpeningBalance, regionForTimezone, suggestAccountName, validateNewAccount, validateTransaction, type Account,
} from '../src';

describe('regions', () => {
  it('every region has a supported currency and a real timezone', () => {
    for (const r of REGIONS) {
      expect(hasSupportedCurrency(r), r.code).toBe(true);
      expect(() => new Intl.DateTimeFormat('en', { timeZone: r.timezone }), r.code).not.toThrow();
      expect(r.currency in CURRENCIES).toBe(true);
    }
    expect(new Set(REGIONS.map((r) => r.code)).size).toBe(REGIONS.length);
    expect(findRegion('BD')!.currency).toBe('BDT');
  });
  it('guesses a region from the device timezone and defaults to Bangladesh', () => {
    expect(regionForTimezone('Asia/Dhaka').code).toBe('BD');
    expect(regionForTimezone('Asia/Kolkata').code).toBe('IN');
    expect(regionForTimezone('America/Chicago').code).toBe('US');
    expect(regionForTimezone('Europe/Paris').code).toBe('EU');
    expect(regionForTimezone('Europe/London').code).toBe('GB');
    expect(regionForTimezone('Pacific/Fiji').code).toBe('BD');
  });
});

describe('profile for a new user', () => {
  it('starts safe: always confirm, AI on, no raw text retained, a sensible high-impact line, not yet onboarded', () => {
    const p = buildProfile('u', findRegion('BD')!, { displayName: '  Nadia  ' });
    expect(p).toMatchObject({ userId: 'u', country: 'BD', currency: 'BDT', timezone: 'Asia/Dhaka', locale: 'mixed', confirmationPref: 'always_confirm',
      retainRawInput: false, aiProcessing: true, displayName: 'Nadia', primaryGoals: [], onboardedAt: null, defaultAccountId: null });
    expect(formatMoney(p.highImpactMinor, 'BDT')).toBe('৳10,000');
    expect(formatMoney(buildProfile('u', findRegion('US')!).highImpactMinor, 'USD')).toBe('$200');
  });
  it('keeps what the user already chose when the profile is rebuilt, and never keeps a blank name', () => {
    const first = { ...buildProfile('u', findRegion('BD')!, { displayName: 'Nadia' }), confirmationPref: 'auto_save_high_confidence' as const, defaultAccountId: 'a1', primaryGoals: ['budget'], aiProcessing: false };
    const again = buildProfile('u', findRegion('BD')!, { displayName: '   ' }, first);
    expect(again).toMatchObject({ confirmationPref: 'auto_save_high_confidence', defaultAccountId: 'a1', primaryGoals: ['budget'], aiProcessing: false, displayName: 'Nadia' });
    expect(buildProfile('u', findRegion('BD')!, { displayName: 'x'.repeat(200) }).displayName).toHaveLength(60);
  });
  it('has the spec\'s goals', () => { expect(PRIMARY_GOALS.map((g) => g.key)).toContain('track_spending'); expect(new Set(PRIMARY_GOALS.map((g) => g.key)).size).toBe(PRIMARY_GOALS.length); });
});

describe('opening balance', () => {
  it.each<[string, number | null]>([
    ['', 0], ['0', 0], ['5000', 500_000], ['৳5,000', 500_000], ['5k', 500_000], ['1.5 lakh', 15_000_000], ['১২০০', 120_000], ['1200 taka', 120_000], ['85.50', 8_550],
    ['-5', null], ['−5', null], ['abc', null], ['5000 and 300', null], ['12 34', null], ['5k pocket', null],
  ])('%j -> %j', (text, expected) => { expect(parseOpeningBalance(text, 'BDT')).toBe(expected); });
});

describe('creating an account', () => {
  const existing: Account[] = [{ id: 'a', userId: 'u', name: 'Cash', type: 'cash', currency: 'BDT', aliases: [], openingBalanceMinor: 0, includeInLiquid: true, archivedAt: null }];
  it('suggests names and aliases a person would actually say', () => {
    expect(suggestAccountName('mobile_wallet', 'BDT')).toBe('bKash');
    expect(suggestAccountName('mobile_wallet', 'USD')).toBe('Mobile wallet');
    expect(defaultAliases('mobile_wallet', 'bKash')).toEqual(expect.arrayContaining(['bkash', 'বিকাশ']));
    expect(defaultAliases('cash', 'Cash')).toEqual(expect.arrayContaining(['cash', 'নগদ টাকা']));
    expect(ACCOUNT_TYPES.map((t) => t.type)).toEqual(['cash', 'bank', 'mobile_wallet', 'card', 'savings']);
  });
  it('validates name and balance together and explains each problem', () => {
    expect(validateNewAccount({ name: 'City Bank', type: 'bank', balanceText: '15000' }, existing, 'BDT')).toEqual({ issues: [], openingBalanceMinor: 1_500_000 });
    expect(validateNewAccount({ name: '  ', type: 'bank', balanceText: '' }, existing, 'BDT').issues).toEqual(['name_required']);
    expect(validateNewAccount({ name: 'cash', type: 'cash', balanceText: '' }, existing, 'BDT').issues).toEqual(['name_taken']);
    expect(validateNewAccount({ name: 'x'.repeat(81), type: 'cash', balanceText: '' }, existing, 'BDT').issues).toEqual(['name_too_long']);
    expect(validateNewAccount({ name: 'Wallet', type: 'cash', balanceText: 'lots' }, existing, 'BDT')).toEqual({ issues: ['balance_invalid'], openingBalanceMinor: null });
    for (const m of Object.values(ACCOUNT_ISSUE_MESSAGES)) expect(m.length).toBeGreaterThan(10);
  });
  it('an archived account does not block reusing its name', () => {
    expect(validateNewAccount({ name: 'Cash', type: 'cash', balanceText: '' }, [{ ...existing[0]!, archivedAt: 'x' }], 'BDT').issues).toEqual([]);
  });
  it('builds a valid account with the right liquidity defaults', () => {
    const a = buildAccount('u', 'id1', { name: '  bKash ', type: 'mobile_wallet', balanceText: '' }, 'BDT', 250_000);
    expect(a).toMatchObject({ name: 'bKash', includeInLiquid: true, openingBalanceMinor: 250_000, currency: 'BDT', archivedAt: null });
    expect(buildAccount('u', 'id2', { name: 'Savings', type: 'savings', balanceText: '' }, 'BDT', 0).includeInLiquid).toBe(false);
    expect(() => buildAccount('u', 'id3', { name: 'X', type: 'cash', balanceText: '' }, 'XXX', 0)).toThrow();
  });
  it('an account built this way accepts transactions through the normal validator', () => {
    const a = buildAccount('u', 'a1', { name: 'Cash', type: 'cash', balanceText: '' }, 'BDT', 0);
    const tx = { id: 't', userId: 'u', type: 'expense', amountMinor: 100, currency: 'BDT', categoryId: null, merchantName: null, accountId: 'a1', toAccountId: null, localDate: '2025-03-15', localTime: null,
      notes: null, paidBy: 'me', splits: null, counterpartyId: null, debtDirection: null, repaymentDirection: null, goalId: null, recurringRuleId: null, occurrenceDate: null, source: 'manual',
      aiConfidence: null, rawInput: null, createdAt: '', updatedAt: '', deletedAt: null, version: 1 } as const;
    expect(validateTransaction({ ...tx }, { accounts: [a], categories: [], people: [], transactions: [] })).toEqual([]);
  });
});
