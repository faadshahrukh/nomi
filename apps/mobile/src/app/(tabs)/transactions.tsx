import { useMemo, useState } from 'react';
import { ScrollView, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { describeTransactions, filterTransactions, type TransactionFilter } from '@nomi/core';
import { gutter, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useLedger } from '@/data/LedgerProvider';
import { groupByDay } from '@/features/transactions/groupByDay';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import { pastDayLabel } from '@/lib/format';
import { Chip, EmptyState, ErrorState, OfflineBanner, ScreenTitle, SkeletonLines, Text } from '@/components/ui';

const FILTERS: Array<{ value: TransactionFilter; label: string; empty: string }> = [
  { value: 'all', label: 'All', empty: 'No transactions yet' },
  { value: 'expenses', label: 'Expenses', empty: 'No expenses recorded' },
  { value: 'income', label: 'Income', empty: 'No income recorded' },
  { value: 'transfers', label: 'Transfers', empty: 'No transfers recorded' },
  { value: 'recurring', label: 'Recurring', empty: 'No recurring payments recorded' },
];

/** Read-only ledger for now. Search, detail and editing arrive in milestone 8. */
export default function Transactions() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, retry } = useLedger();
  const [filter, setFilter] = useState<TransactionFilter>('all');

  const all = useMemo(() => (state.status === 'ready' ? describeTransactions(state.snapshot.transactions, state.snapshot.accounts, state.snapshot.categories) : []), [state]);
  const sections = useMemo(() => groupByDay(filterTransactions(all, filter)), [all, filter]);
  const today = state.status === 'ready' ? state.summary.today : '';
  const currency = state.status === 'ready' ? state.summary.currency : 'BDT';

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.md }}>
      <OfflineBanner />
      <ScreenTitle title="Transactions" subtitle="Your complete ledger" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} accessibilityLabel="Filter transactions">
        {FILTERS.map((f) => <Chip key={f.value} label={f.label} selected={f.value === filter} onPress={() => setFilter(f.value)} />)}
      </ScrollView>
    </View>
  );

  return (
    <SectionList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: gutter, paddingBottom: space.huge * 2 }}
      sections={state.status === 'ready' ? sections : []}
      keyExtractor={(i) => i.transaction.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => <Text variant="overline" tone="muted" style={{ paddingTop: space.lg, paddingBottom: space.xs }} accessibilityRole="header">{pastDayLabel(section.date, today)}</Text>}
      renderItem={({ item }) => <TransactionRow item={item} today={today} currency={currency} showDay={false} />}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
      ListEmptyComponent={
        state.status === 'loading' ? <SkeletonLines lines={6} />
        : state.status === 'error' ? <ErrorState onRetry={retry} title="Couldn't load transactions" />
        : <EmptyState icon="list" title={FILTERS.find((f) => f.value === filter)!.empty} message={filter === 'all' ? 'Tell Nomi what happened from Home. Everything you record shows up here.' : 'Try another filter.'} />
      }
    />
  );
}
