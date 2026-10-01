import { View } from 'react-native';
import type { HomeSummary } from '@nomi/core';
import { space } from '@/design/tokens';
import { EmptyState, Surface } from '@/components/ui';
import { TransactionRow } from '@/features/transactions/TransactionRow';

/** How many lines Home shows. The full ledger is one tap away. */
export const HOME_RECENT = 4;

export function RecentActivity({ summary }: { summary: HomeSummary }) {
  if (!summary.recent.length) return <Surface rounded="lg"><EmptyState compact title="No transactions yet" message="Tell Nomi what you spent and it will appear here." /></Surface>;
  return (
    <Surface padding="sm" rounded="lg">
      <View style={{ paddingHorizontal: space.md }}>
        {summary.recent.slice(0, HOME_RECENT).map((r) => <TransactionRow key={r.transaction.id} item={r} today={summary.today} currency={summary.currency} />)}
      </View>
    </Surface>
  );
}
