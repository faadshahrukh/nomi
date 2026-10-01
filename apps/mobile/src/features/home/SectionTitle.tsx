import { Pressable, View } from 'react-native';
import { MIN_TOUCH, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Icon, Text, type IconName } from '@/components/ui';

/** Section heading with a leading icon and an optional "View all" link. */
export function SectionTitle({ icon, title, actionLabel = 'View all', onAction }: { icon: IconName; title: string; actionLabel?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: MIN_TOUCH - 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Icon name={icon} size={20} color={colors.ink} />
        <Text variant="heading" weight="bold" accessibilityRole="header">{title}</Text>
      </View>
      {onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${actionLabel}: ${title}`} onPress={onAction} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: MIN_TOUCH - 8 }}>
          <Text variant="caption" weight="semibold" tone="muted">{actionLabel}</Text>
          <Icon name="chevronRight" size={14} color={colors.inkMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
