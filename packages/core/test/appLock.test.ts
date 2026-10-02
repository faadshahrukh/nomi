import { describe, expect, it } from 'vitest';
import { LOCK_DEFAULT_GRACE, canProtect, parseGrace, shouldLock } from '../src';

const on = (graceSeconds: 0 | 30 | 60 | 300) => ({ enabled: true, graceSeconds });
describe('app lock', () => {
  it('never locks when switched off', () => {
    expect(shouldLock({ settings: { enabled: false, graceSeconds: 0 }, backgroundedAtMs: 0, nowMs: 10_000_000 })).toBe(false);
    expect(shouldLock({ settings: { enabled: false, graceSeconds: 0 }, backgroundedAtMs: null, nowMs: 1 })).toBe(false);
  });
  it('always locks on a fresh start', () => { expect(shouldLock({ settings: on(300), backgroundedAtMs: null, nowMs: 1 })).toBe(true); });
  it('locks only after the grace period away', () => {
    expect(shouldLock({ settings: on(30), backgroundedAtMs: 1_000, nowMs: 1_000 + 29_999 })).toBe(false);
    expect(shouldLock({ settings: on(30), backgroundedAtMs: 1_000, nowMs: 1_000 + 30_000 })).toBe(true);
    expect(shouldLock({ settings: on(0), backgroundedAtMs: 1_000, nowMs: 1_000 })).toBe(true); // "immediately"
    expect(shouldLock({ settings: on(300), backgroundedAtMs: 1_000, nowMs: 1_000 + 299_000 })).toBe(false);
  });
  it('treats a clock that went backwards as a long absence', () => {
    expect(shouldLock({ settings: on(300), backgroundedAtMs: 10_000, nowMs: 5_000 })).toBe(true);
  });
  it('parses the stored grace and falls back safely', () => {
    expect([parseGrace('0'), parseGrace('60'), parseGrace('300')]).toEqual([0, 60, 300]);
    expect([parseGrace(null), parseGrace(''), parseGrace('7'), parseGrace('abc')]).toEqual([LOCK_DEFAULT_GRACE, LOCK_DEFAULT_GRACE, LOCK_DEFAULT_GRACE, LOCK_DEFAULT_GRACE]);
  });
  it('cannot protect a phone with no screen lock', () => {
    expect(canProtect({ hardware: true, enrolled: true })).toBe(true);
    expect(canProtect({ hardware: true, enrolled: false })).toBe(false);
    expect(canProtect({ hardware: false, enrolled: false })).toBe(false);
  });
});
