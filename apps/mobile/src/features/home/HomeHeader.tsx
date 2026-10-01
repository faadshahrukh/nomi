import { View } from 'react-native';
import { space } from '@/design/tokens';
import { IconButton, Text } from '@/components/ui';

export function greetingFor(hour: number): string {
  if (hour < 5) return 'Still up?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomeHeader({ now, onNotifications, onProfile }: { now: Date; onNotifications: () => void; onProfile: () => void }) {
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ gap: space.xxs }}>
        <Text variant="overline" tone="muted">{date}</Text>
        <Text variant="title" accessibilityRole="header">{greetingFor(now.getHours())}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: space.xs }}>
        <IconButton icon="bell" label="Notifications" variant="tonal" onPress={onNotifications} />
        <IconButton icon="user" label="Profile" variant="tonal" onPress={onProfile} />
      </View>
    </View>
  );
}
