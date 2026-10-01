import { View } from 'react-native';
import { radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Icon, Text } from '@/components/ui';

/** Shown whenever example data is loaded, so nobody mistakes it for their own money. */
export function DemoBanner() {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="summary" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.accentSoft, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
      <Icon name="code" size={16} color={colors.onAccentSoft} />
      <Text variant="caption" weight="semibold" style={{ color: colors.onAccentSoft, flex: 1 }}>Demo data. Example numbers, not yours.</Text>
    </View>
  );
}
