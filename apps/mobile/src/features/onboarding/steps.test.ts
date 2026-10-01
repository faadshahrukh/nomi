import { describe, expect, it } from 'vitest';
import { SKIPPABLE, stepProgress, stepsFor } from './steps';

describe('onboarding steps', () => {
  it('includes sign-in only when configured and signed out', () => {
    expect(stepsFor({ backendConfigured: true, signedIn: false })).toContain('auth');
    expect(stepsFor({ backendConfigured: false, signedIn: false })).not.toContain('auth');
    expect(stepsFor({ backendConfigured: true, signedIn: true })).not.toContain('auth');
  });
  it('always ends with the first capture and requires an account', () => {
    const s = stepsFor({ backendConfigured: false, signedIn: false });
    expect(s[s.length - 1]).toBe('try');
    expect(SKIPPABLE.account).toBe(false);
  });
  it('reports progress', () => {
    const s = stepsFor({ backendConfigured: false, signedIn: false });
    expect(stepProgress(s, 'welcome')).toEqual({ index: 1, total: s.length });
  });
});
