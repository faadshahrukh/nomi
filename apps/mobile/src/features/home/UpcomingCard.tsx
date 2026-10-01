import { View } from 'react-native';
import { UPCOMING_WINDOW_DAYS, type Account, type HomeSummary } from '@nomi/core';
import { space } from '@/design/tokens';
import { EmptyState, Money, Surface, Text, Tile } from '@/components/ui';
import { glyphFor } from '@/lib/glyphs';
import { monthDay, upcomingLabel } from '@/lib/format';

/** How many bills Home shows. The rest are one tap away in Planning. */
export const HOME_UPCOMING = 3;

export function UpcomingCard({ summary, accounts }: { summary: HomeSummary; accounts: Account[] }) {
  if (!summary.upcoming.length) return <Surface rounded="lg"><EmptyState compact title={`No bills in the next ${UPCOMING_WINDOW_DAYS} days`} message="Recurring payments you add will show up here before they are due." /></Surface>;
  return (
    <Surface padding="sm" rounded="lg">
      <View style={{ paddingHorizontal: space.md }}>
        {summary.upcoming.slice(0, HOME_UPCOMING).map((u) => {
          const g = glyphFor('expense', u.rule.categoryId);
          const acct = accounts.find((a) => a.id === u.rule.accountId)?.name;
          return (
            <View key={`${u.rule.id}-${u.date}`} accessible accessibilityLabel={`${u.rule.name}, ${upcomingLabel(u.date, summary.today)}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm }}>
              <Tile icon={g.icon} tone={g.tone} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={1}>{u.rule.name}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>{[monthDay(u.date), acct].filter(Boolean).join(' · ')}</Text>
              </View>
              <Money minor={u.amountMinor} currency={summary.currency} size="small" />
            </View>
          );
        })}
      </View>
    </Surface>
  );
}
