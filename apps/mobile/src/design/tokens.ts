/**
 * Design tokens. Screens and components use only these semantic names, never literal colours,
 * so dark mode is a token swap. Contrast of every text/surface pair is enforced in tokens.test.ts.
 */
export interface ColorTokens {
  bg: string;            // app background
  surface: string;       // cards, sheets
  surfaceSunken: string; // inputs, tracks, quiet wells
  ink: string;           // primary text
  inkMuted: string;      // secondary text
  border: string;
  accent: string;        // the single brand colour: capture, primary actions
  onAccent: string;
  accentSoft: string;    // tinted backgrounds for accent-related content
  onAccentSoft: string;
  positive: string; positiveSoft: string;
  caution: string; cautionSoft: string;
  negative: string; negativeSoft: string;
  scrim: string;         // modal backdrop
}

export const lightColors: ColorTokens = {
  bg: '#F4F6F9', surface: '#FFFFFF', surfaceSunken: '#E9EDF3',
  ink: '#0E1726', inkMuted: '#4B5A73', border: '#D9E0EA',
  accent: '#2450F0', onAccent: '#FFFFFF', accentSoft: '#E3EAFF', onAccentSoft: '#1B3DB8',
  positive: '#0B6B45', positiveSoft: '#DCF2E7',
  caution: '#8A5200', cautionSoft: '#FDEFD3',
  negative: '#B3261E', negativeSoft: '#FBE4E2',
  scrim: 'rgba(8, 14, 26, 0.45)',
};

export const darkColors: ColorTokens = {
  bg: '#0A0F1A', surface: '#131B2B', surfaceSunken: '#0E1524',
  ink: '#EDF1F8', inkMuted: '#9CABC3', border: '#26324B',
  accent: '#8AA2FF', onAccent: '#0A1230', accentSoft: '#1B2753', onAccentSoft: '#B8C7FF',
  positive: '#5FD3A0', positiveSoft: '#11332A',
  caution: '#F2B84B', cautionSoft: '#3A2B0E',
  negative: '#FF8F86', negativeSoft: '#3D1C1A',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

export type Scheme = 'light' | 'dark';
export const colorsFor = (s: Scheme): ColorTokens => (s === 'dark' ? darkColors : lightColors);

/** 4pt grid. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;
/** Side gutter for screens. */
export const gutter = space.xl;
export const MAX_CONTENT_WIDTH = 520;
/** Minimum interactive size in points. */
export const MIN_TOUCH = 44;

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';
export const fontFamily: Record<FontWeight, string> = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
};

/** Bengali face. Also supplies the taka sign (৳), which Latin UI fonts lack and render small from a fallback font. */
export const bengaliFamily: Record<FontWeight, string> = {
  regular: 'NotoSansBengali_400Regular',
  medium: 'NotoSansBengali_500Medium',
  semibold: 'NotoSansBengali_600SemiBold',
  bold: 'NotoSansBengali_700Bold',
  extrabold: 'NotoSansBengali_800ExtraBold',
};

export interface TextStyleToken { size: number; line: number; weight: FontWeight; tracking?: number; upper?: boolean }
export const typography = {
  hero:     { size: 44, line: 50, weight: 'extrabold', tracking: -1 },   // Safe to Spend, balance
  display:  { size: 32, line: 38, weight: 'bold', tracking: -0.6 },
  title:    { size: 24, line: 30, weight: 'bold', tracking: -0.3 },
  heading:  { size: 18, line: 24, weight: 'semibold' },
  body:     { size: 16, line: 23, weight: 'regular' },
  bodyStrong: { size: 16, line: 23, weight: 'semibold' },
  callout:  { size: 14, line: 20, weight: 'medium' },
  caption:  { size: 12, line: 16, weight: 'medium' },
  overline: { size: 11, line: 14, weight: 'bold', tracking: 0.8, upper: true },
} as const satisfies Record<string, TextStyleToken>;
export type TypeVariant = keyof typeof typography;

export const motion = { fast: 120, base: 200, slow: 320 } as const;
