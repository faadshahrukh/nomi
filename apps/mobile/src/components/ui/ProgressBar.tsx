import { View } from 'react-native';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/theme';

export type ProgressTone = 'accent' | 'positive' | 'caution' | 'negative';

/** value is 0..1 and clamped. `label` is read by screen readers, e.g. "Groceries budget". */
export function ProgressBar({ value, tone = 'accent', label, height = 8 }: { value: number; tone?: ProgressTone; label: string; height?: number }) {
  const { colors } = useTheme();
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const fill = { accent: colors.accent, positive: colors.positive, caution: colors.caution, negative: colors.negative }[tone];
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}
      style={{ height, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden' }}>
      <View style={{ width: `${v * 100}%`, height: '100%', borderRadius: radius.pill, backgroundColor: fill }} />
    </View>
  );
}
