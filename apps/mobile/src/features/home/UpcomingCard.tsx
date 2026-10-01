import { View } from 'react-native';
import { UPCOMING_WINDOW_DAYS, type HomeSummary } from '@nomi/core';
import { radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { EmptyState, Icon, Money, Surface, Text } from '@/components/ui';
import { upcomingLabel } from '@/lib/format';

export function UpcomingCard({ summary }: { summary: HomeSummary }) {
  const { colors } = useTheme();
  if (!summary.upcoming.length) return <Surface><EmptyState compact title={`No bills in the next ${UPCOMING_WINDOW_DAYS} days`} message="Recurring payments you add will show up here before they are due." /></Surface>;
  return (
    <Surface padding="sm">
      {summary.upcoming.map((u) => (
        <View key={`${u.rule.id}-${u.date}`} accessible accessibilityLabel={`${u.rule.name}, ${upcomingLabel(u.date, summary.today)}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, paddingHorizontal: space.md }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="planning" size={20} color={colors.ink} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={1}>{u.rule.name}</Text>
            <Text variant="caption" tone="muted">{upcomingLabel(u.date, summary.today)}</Text>
          </View>
          <Money minor={u.amountMinor} currency={summary.currency} size="small" />
        </View>
      ))}
    </Surface>
  );
}
