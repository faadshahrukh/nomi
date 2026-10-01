import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gutter, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { OfflineBanner } from './OfflineBanner';
import { Text } from './Text';

/** Standard scrolling screen: safe-area top, consistent gutter, offline banner, room for the tab bar. */
export function Screen({ children, showOffline = true, ...rest }: ScrollViewProps & { showOffline?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: gutter, paddingBottom: space.huge * 2, gap: space.xl }}
      {...rest}
    >
      {showOffline ? <OfflineBanner /> : null}
      {children}
    </ScrollView>
  );
}

export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md }}>
      <View style={{ flex: 1, gap: space.xs }}>
        <Text variant="display" accessibilityRole="header">{title}</Text>
        {subtitle ? <Text variant="callout" tone="muted">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}
