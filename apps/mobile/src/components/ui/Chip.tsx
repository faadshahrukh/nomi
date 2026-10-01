import { Pressable } from 'react-native';
import { MIN_TOUCH, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Text } from './Text';

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button" aria-pressed={!!selected} onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH, paddingHorizontal: space.lg, borderRadius: radius.pill, justifyContent: 'center',
        backgroundColor: selected ? colors.ink : colors.surface, borderWidth: 1, borderColor: selected ? colors.ink : colors.border, opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text variant="callout" style={{ color: selected ? colors.bg : colors.ink }}>{label}</Text>
    </Pressable>
  );
}
