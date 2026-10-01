import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { bengaliFamily, fontFamily, type TypeVariant, type ColorTokens, type FontWeight, type TextStyleToken, typography } from '@/design/tokens';
import { useTheme } from '@/design/theme';

export type Tone = 'ink' | 'muted' | 'accent' | 'onAccent' | 'positive' | 'caution' | 'negative' | 'onForest' | 'onForestMuted' | 'forestPositive';

export const toneColor = (c: ColorTokens, tone: Tone): string =>
  ({ ink: c.ink, muted: c.inkMuted, accent: c.accent, onAccent: c.onAccent, positive: c.positive, caution: c.caution, negative: c.negative, onForest: c.onForest, onForestMuted: c.onForestMuted, forestPositive: c.forestPositive })[tone];

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: Tone;
  weight?: FontWeight;
  align?: TextStyle['textAlign'];
  /** Tabular figures so digits line up. Use for money and counts. */
  numeric?: boolean;
}

const TAKA = '৳';

/** Draws the taka sign in a face that has it, so ৳ matches the digits beside it. Other text passes through. */
function withTaka(children: React.ReactNode, family: string): React.ReactNode {
  if (typeof children !== 'string' || !children.includes(TAKA)) return children;
  return children.split(TAKA).flatMap((part, i) =>
    i === 0 ? [part] : [<RNText key={i} style={{ fontFamily: family }}>{TAKA}</RNText>, part]);
}

export function Text({ variant = 'body', tone = 'ink', weight, align, numeric, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const t: TextStyleToken = typography[variant];
  const isHero = variant === 'hero' || variant === 'display';
  const w = weight ?? t.weight;
  return (
    <RNText
      maxFontSizeMultiplier={isHero ? 1.2 : 1.6}
      {...rest}
      children={withTaka(rest.children, bengaliFamily[w])}
      style={[
        {
          color: toneColor(colors, tone), fontFamily: fontFamily[w], fontSize: t.size, lineHeight: t.line,
          letterSpacing: 'tracking' in t ? t.tracking : undefined, textAlign: align,
          textTransform: 'upper' in t ? 'uppercase' : undefined,
          fontVariant: numeric ? ['tabular-nums'] : undefined,
        },
        style,
      ]}
    />
  );
}
