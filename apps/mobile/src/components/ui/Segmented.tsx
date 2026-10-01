import { Pressable, View } from 'react-native';
import { MIN_TOUCH, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Text } from './Text';

export interface SegmentedProps<T extends string> {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  accessibilityLabel: string;
}

export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedProps<T>) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: 'row', backgroundColor: colors.surfaceSunken, borderRadius: radius.pill, padding: space.xs }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" aria-checked={on} onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: MIN_TOUCH, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.surface : 'transparent' }}>
            <Text variant="callout" weight={on ? 'semibold' : 'medium'} tone={on ? 'ink' : 'muted'}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
