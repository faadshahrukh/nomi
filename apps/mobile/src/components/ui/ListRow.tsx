import { Pressable, View } from 'react-native';
import { MIN_TOUCH, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ListRowProps {
  icon?: IconName; title: string; subtitle?: string; trailing?: React.ReactNode; onPress?: () => void; showChevron?: boolean;
}

export function ListRow({ icon, title, subtitle, trailing, onPress, showChevron }: ListRowProps) {
  const { colors } = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: MIN_TOUCH + 12, paddingVertical: space.sm }}>
      {icon ? (
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color={colors.ink} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text variant="callout" tone="muted" numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {trailing}
      {showChevron ? <Icon name="chevronRight" size={20} color={colors.inkMuted} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>{body}</Pressable>
  ) : body;
}
