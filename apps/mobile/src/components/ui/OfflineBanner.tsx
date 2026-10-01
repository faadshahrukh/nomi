import { View } from 'react-native';
import { radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useOnline } from '@/providers/NetworkProvider';
import { Icon } from './Icon';
import { Text } from './Text';

/** Shown only while the device is offline. Copy states only what is true of the current build. */
export function OfflineBanner() {
  const { colors } = useTheme();
  const online = useOnline();
  if (online !== false) return null;
  return (
    <View accessibilityRole="alert" aria-live="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.cautionSoft, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md }}>
      <Icon name="wifiOff" size={18} color={colors.caution} />
      <Text variant="callout" style={{ color: colors.caution, flex: 1 }}>You're offline. Some features need a connection.</Text>
    </View>
  );
}
