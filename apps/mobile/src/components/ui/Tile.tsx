import { View } from 'react-native';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { tileColors, type TileTone } from '@/lib/glyphs';
import { Icon, type IconName } from './Icon';

/** Rounded pastel square holding a category icon. Decorative: the row it sits in carries the accessible name. */
export function Tile({ icon, tone, size = 44 }: { icon: IconName; tone: TileTone; size?: number }) {
  const { colors } = useTheme();
  const c = tileColors(colors, tone);
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md - 2, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={Math.round(size * 0.5)} color={c.fg} />
    </View>
  );
}
