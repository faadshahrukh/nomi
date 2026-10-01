import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, equalSplit, extractAmounts, formatMoney, parseAmountText, resolveDateRef, todayIn, toMinor } from '../src';

describe('money', () => {
  it('converts decimal strings to minor units without float error', () => {
    expect(toMinor('1200', 'BDT')).toBe(120000);
    expect(toMinor('1.005', 'BDT')).toBe(101);
    expect(toMinor('0.29', 'BDT')).toBe(29);
    expect(toMinor(19.99, 'USD')).toBe(1999);
  });
  it('formats BDT with lakh/crore grouping and Bangla digits', () => {
    expect(formatMoney(12_000_000, 'BDT')).toBe('৳1,20,000');
    expect(formatMoney(45_000, 'BDT')).toBe('৳450');
    expect(formatMoney(12_345_678, 'BDT')).toBe('৳1,23,456.78');
    expect(formatMoney(-85_000, 'BDT')).toBe('-৳850');
    expect(formatMoney(12_000_000, 'BDT', { locale: 'bn' })).toBe('৳১,২০,০০০');
    expect(formatMoney(123_456_700, 'USD')).toBe('$1,234,567');
  });
  it('parses shorthand and Bangla amounts', () => {
    expect(parseAmountText('5k', 'BDT')).toBe(500_000);
    expect(parseAmountText('1.5 lakh', 'BDT')).toBe(15_000_000);
    expect(parseAmountText('১২০০', 'BDT')).toBe(120_000);
    expect(parseAmountText('1,20,000', 'BDT')).toBe(12_000_000);
    expect(parseAmountText('২ হাজার', 'BDT')).toBe(200_000);
    expect(parseAmountText('৳850', 'BDT')).toBe(85_000);
    expect(parseAmountText('no number', 'BDT')).toBeNull();
    expect(parseAmountText('100 and 200', 'BDT')).toBeNull(); // ambiguous: exactly one amount required
  });
  it('extracts every amount from free text', () => {
    expect(extractAmounts('I spent 800 on groceries and 300 on Uber', 'BDT')).toEqual([80_000, 30_000]);
  });
  it('splits evenly with no lost minor units', () => {
    const parts = equalSplit(10_000, ['me', 'a', 'b']);
    expect(parts.map((p) => p.amountMinor)).toEqual([3334, 3333, 3333]);
    expect(parts.reduce((s, p) => s + p.amountMinor, 0)).toBe(10_000);
  });
});

describe('dates', () => {
  it('clamps month-end and crosses year boundaries', () => {
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-11-15', 3)).toBe('2026-02-15');
    expect(addMonths('2025-03-31', -1)).toBe('2025-02-28');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(diffDays('2025-03-01', '2025-03-31')).toBe(30);
  });
  it('resolves "today" in the user timezone, not UTC', () => {
    const instant = new Date('2025-03-15T19:30:00Z'); // 01:30 on the 16th in Dhaka (UTC+6)
    expect(todayIn('Asia/Dhaka', instant)).toBe('2025-03-16');
    expect(todayIn('UTC', instant)).toBe('2025-03-15');
  });
  it('resolves date references against the given today', () => {
    expect(resolveDateRef({ kind: 'yesterday' }, '2025-03-01').date).toBe('2025-02-28');
    expect(resolveDateRef({ kind: 'days_ago', n: 3 }, '2025-03-15').date).toBe('2025-03-12');
    expect(resolveDateRef({ kind: 'unspecified' }, '2025-03-15')).toEqual({ date: '2025-03-15', explicit: false });
    expect(resolveDateRef({ kind: 'absolute', date: '2025-02-30' }, '2025-03-15').date).toBeNull();
  });
});
