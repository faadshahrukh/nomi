import { Pressable, View } from 'react-native';
import { MIN_TOUCH, space } from '@/design/tokens';
import { Text } from './Text';

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: space.xxxl }}>
      <Text variant="heading" accessibilityRole="header">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          <Text variant="callout" tone="accent" weight="semibold">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
