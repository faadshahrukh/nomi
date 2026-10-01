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
  accent: string;        // the single brand colour (deep green): mic, primary actions, active tab
  onAccent: string;
  accentSoft: string;    // mint tint: capture and Safe to Spend cards, soft highlights
  onAccentSoft: string;
  forest: string;        // the dark hero card (Money Pulse)
  onForest: string;
  onForestMuted: string;
  forestPositive: string; // positive figures on the forest card
  positive: string; positiveSoft: string;
  caution: string; cautionSoft: string; // warm orange: Nomi Signal and "watch" states
  negative: string; negativeSoft: string;
  /** Pastel icon tiles for categories. Each pair is (background, icon colour). */
  tileMint: string; onTileMint: string;
  tileLav: string; onTileLav: string;
  tileSky: string; onTileSky: string;
  tilePeach: string; onTilePeach: string;
  tileSand: string; onTileSand: string;
  tileRose: string; onTileRose: string;
  scrim: string;         // modal backdrop
}

export const lightColors: ColorTokens = {
  bg: '#F7F8F5', surface: '#FFFFFF', surfaceSunken: '#EDF2EE',
  ink: '#0F241C', inkMuted: '#566860', border: '#E2E9E4',
  accent: '#0F5A44', onAccent: '#FFFFFF', accentSoft: '#E1F3E9', onAccentSoft: '#0E4A38',
  forest: '#0E3F33', onForest: '#FFFFFF', onForestMuted: '#B9D6CA', forestPositive: '#8FE3BC',
  positive: '#17794F', positiveSoft: '#DDF3E6',
  caution: '#9A4A12', cautionSoft: '#FDEBDD',
  negative: '#B3261E', negativeSoft: '#FBE4E2',
  tileMint: '#DDF3E6', onTileMint: '#17794F', tileLav: '#E9E6FA', onTileLav: '#5446B8', tileSky: '#DFEDFA', onTileSky: '#1D5C99',
  tilePeach: '#FDEBDD', onTilePeach: '#9A4A12', tileSand: '#F3EEDC', onTileSand: '#74601A', tileRose: '#FBE3EA', onTileRose: '#A32A4B',
  scrim: 'rgba(6, 18, 13, 0.45)',
};

export const darkColors: ColorTokens = {
  bg: '#09130F', surface: '#111F19', surfaceSunken: '#0C1813',
  ink: '#E6F1EA', inkMuted: '#91A79C', border: '#1F3028',
  accent: '#5FD6A5', onAccent: '#05261A', accentSoft: '#143A2D', onAccentSoft: '#A9E8CB',
  forest: '#143F33', onForest: '#FFFFFF', onForestMuted: '#A9C9BB', forestPositive: '#8FE3BC',
  positive: '#5FD6A5', positiveSoft: '#123428',
  caution: '#F0A867', cautionSoft: '#3A2414',
  negative: '#FF8F86', negativeSoft: '#3D1C1A',
  tileMint: '#143A2D', onTileMint: '#7FE0B5', tileLav: '#262345', onTileLav: '#B3A9FF', tileSky: '#12304A', onTileSky: '#8CC4F5',
  tilePeach: '#3A2414', onTilePeach: '#F0A867', tileSand: '#34301A', onTileSand: '#E4CF7A', tileRose: '#3D1C28', onTileRose: '#F59AB5',
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
