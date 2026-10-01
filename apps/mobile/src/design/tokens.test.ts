import { describe, expect, it } from 'vitest';
import { contrast } from './contrast';
import { darkColors, lightColors, type ColorTokens } from './tokens';

const pairs: Array<[keyof ColorTokens, keyof ColorTokens, number]> = [
  ['ink', 'bg', 7], ['ink', 'surface', 7], ['ink', 'surfaceSunken', 7],
  ['inkMuted', 'bg', 4.5], ['inkMuted', 'surface', 4.5], ['inkMuted', 'surfaceSunken', 4.5],
  ['onAccent', 'accent', 4.5], ['onAccentSoft', 'accentSoft', 4.5],
  ['accent', 'surface', 3],  ['accent', 'bg', 3],     // non-text UI (focus rings, icons)
  ['positive', 'positiveSoft', 4.5], ['caution', 'cautionSoft', 4.5], ['negative', 'negativeSoft', 4.5],
  ['positive', 'surface', 4.5], ['caution', 'surface', 4.5], ['negative', 'surface', 4.5],
  ['positive', 'bg', 4.5], ['caution', 'bg', 4.5], ['negative', 'bg', 4.5],
];

describe.each([['light', lightColors], ['dark', darkColors]] as const)('%s palette contrast', (_name, c) => {
  it.each(pairs)('%s on %s is at least %s:1', (fg, bg, min) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(min);
  });
});
