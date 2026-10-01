import { describe, expect, it } from 'vitest';
import { PASSWORD_MESSAGES, isEmail, passwordProblem } from './validation';

describe('sign-in validation', () => {
  it.each([['a@b.co', true], ['  nadia@example.com ', true], ['first.last+tag@sub.example.org', true], ['a@b', false], ['a b@c.co', false], ['@b.co', false], ['', false], ['a@@b.co', false], ['a@b.c', false]])('email %j -> %s', (s, ok) => { expect(isEmail(s)).toBe(ok); });
  it('rejects absurdly long emails', () => { expect(isEmail('a'.repeat(250) + '@b.co')).toBe(false); });
  it('enforces password length at both ends', () => {
    expect(passwordProblem('1234567')).toBe('too_short');
    expect(passwordProblem('12345678')).toBeNull();
    expect(passwordProblem('x'.repeat(72))).toBeNull();
    expect(passwordProblem('x'.repeat(73))).toBe('too_long');
    expect(PASSWORD_MESSAGES.too_short).toMatch(/8/);
  });
});
