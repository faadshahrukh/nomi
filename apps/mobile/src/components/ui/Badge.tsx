import { View } from 'react-native';
import { radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type BadgeTone = 'neutral' | 'accent' | 'positive' | 'caution' | 'negative';

/** Status pill. Always carries an icon or text so meaning never depends on colour alone. */
export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: BadgeTone; icon?: IconName }) {
  const { colors: c } = useTheme();
  const map = {
    neutral: [c.surfaceSunken, c.ink], accent: [c.accentSoft, c.onAccentSoft], positive: [c.positiveSoft, c.positive],
    caution: [c.cautionSoft, c.caution], negative: [c.negativeSoft, c.negative],
  }[tone] as [string, string];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', backgroundColor: map[0], paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill }}>
      {icon ? <Icon name={icon} size={14} color={map[1]} /> : null}
      <Text variant="caption" weight="semibold" style={{ color: map[1] }}>{label}</Text>
    </View>
  );
}
