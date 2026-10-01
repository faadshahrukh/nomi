import { Pressable, View } from 'react-native';
import { MIN_TOUCH, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Badge, Icon, Text } from '@/components/ui';

/** One editable line in the review card. Tapping it opens the editor for that field. */
export function FieldRow({ label, value, hint, status, onPress, valueNode }: {
  label: string; value: string; hint?: string;
  /** 'assumed' = filled in by the app without being told; 'needed' = required and missing. */
  status?: 'assumed' | 'needed';
  onPress: () => void; valueNode?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}${status === 'assumed' ? ', assumed' : status === 'needed' ? ', needed' : ''}. Tap to change.`}
      onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: MIN_TOUCH + 8, paddingVertical: space.sm, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="caption" tone="muted">{label}</Text>
        {valueNode ?? <Text variant="bodyStrong" numberOfLines={2} tone={status === 'needed' ? 'caution' : 'ink'}>{value}</Text>}
        {hint ? <Text variant="caption" tone="muted">{hint}</Text> : null}
      </View>
      {status === 'assumed' ? <Badge label="Assumed" tone="neutral" /> : status === 'needed' ? <Badge label="Needed" tone="caution" icon="alert" /> : null}
      <Icon name="chevronRight" size={18} color={colors.inkMuted} />
    </Pressable>
  );
}
