import { Pressable, View } from 'react-native';
import { formatLocalDate } from '@nomi/core';
import { MIN_TOUCH, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Icon, IconButton, Text } from '@/components/ui';
import { friendlyDate } from '@/lib/format';

export function greetingFor(hour: number): string {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export interface HomeHeaderProps {
  /** Device clock, for the greeting only. */
  now: Date;
  /** The ledger's "today" (user timezone) once loaded; until then the device date is shown. */
  today: string;
  name: string | null;
  demo?: boolean;
  onNotifications: () => void;
  onProfile: () => void;
}

export function HomeHeader({ now, today, name, demo, onNotifications, onProfile }: HomeHeaderProps) {
  const { colors } = useTheme();
  const hour = now.getHours();
  const night = hour < 5 || hour >= 18;
  const initial = (name ?? '').trim().slice(0, 1).toUpperCase();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Icon name={night ? 'moon' : 'sun'} size={30} color={night ? colors.accent : '#E9A23B'} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="heading" weight="bold" numberOfLines={1} accessibilityRole="header">{name ? `${greetingFor(hour)}, ${name}` : greetingFor(hour)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text variant="callout" tone="muted" numberOfLines={1}>{friendlyDate(today || formatLocalDate(now.getFullYear(), now.getMonth() + 1, now.getDate()))}</Text>
          {demo ? (
            <View accessibilityLabel="Demo data. Example numbers, not yours." style={{ backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 }}>
              <Text variant="caption" weight="bold" style={{ color: colors.onAccentSoft }}>Demo data</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Profile and settings" onPress={onProfile}
        style={({ pressed }) => ({ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1, minHeight: MIN_TOUCH })}>
        {initial ? <Text variant="bodyStrong" style={{ color: colors.onAccentSoft }}>{initial}</Text> : <Icon name="user" size={22} color={colors.onAccentSoft} />}
      </Pressable>
      <IconButton icon="bell" label="Notifications" onPress={onNotifications} />
    </View>
  );
}
