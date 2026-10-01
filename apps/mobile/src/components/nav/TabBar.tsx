import { Pressable, View, type ViewProps } from 'react-native';
import type { TabTriggerSlotProps } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Icon, type IconName, Text } from '@/components/ui';

export const TAB_BAR_HEIGHT = 64;

export const TABS: Array<{ name: string; href: '/' | '/transactions' | '/insights' | '/planning' | '/profile'; label: string; icon: IconName }> = [
  { name: 'home', href: '/', label: 'Home', icon: 'home' },
  { name: 'transactions', href: '/transactions', label: 'Transactions', icon: 'list' },
  { name: 'insights', href: '/insights', label: 'Insights', icon: 'insights' },
  { name: 'planning', href: '/planning', label: 'Planning', icon: 'planning' },
  { name: 'profile', href: '/profile', label: 'Profile', icon: 'user' },
];

export function TabBarContainer({ children, style, ...rest }: ViewProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View {...rest} style={[{ flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: insets.bottom, paddingHorizontal: space.xs }, style]}>
      {children}
    </View>
  );
}

export function TabButton({ isFocused, label, icon, ...props }: TabTriggerSlotProps & { label: string; icon: IconName }) {
  const { colors } = useTheme();
  const tint = isFocused ? colors.accent : colors.inkMuted;
  return (
    <Pressable {...props} accessibilityRole="tab" accessibilityLabel={label} aria-selected={!!isFocused}
      style={({ pressed }) => ({ flex: 1, minHeight: Math.max(TAB_BAR_HEIGHT, MIN_TOUCH), alignItems: 'center', justifyContent: 'center', gap: 3, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={22} color={tint} strokeWidth={isFocused ? 2.4 : 2} />
      <Text variant="caption" weight={isFocused ? 'bold' : 'medium'} style={{ color: tint }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
