import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/** Light tap feedback on native only. Never throws. */
export function tap(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
export function success(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
