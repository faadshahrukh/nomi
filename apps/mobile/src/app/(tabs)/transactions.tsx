import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeFilterCount, describeTransactions, queryTransactions, type TransactionFilter, type TransactionQuery } from '@nomi/core';
import { fontFamily, gutter, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useLedger } from '@/data/LedgerProvider';
import { groupByDay } from '@/features/transactions/groupByDay';
import { TransactionRow } from '@/features/transactions/TransactionRow';
import { pastDayLabel } from '@/lib/format';
import { FilterSheet } from '@/features/transactions/FilterSheet';
import { Button, Chip, EmptyState, ErrorState, Icon, OfflineBanner, ScreenTitle, SkeletonLines, Text } from '@/components/ui';

const FILTERS: Array<{ value: TransactionFilter; label: string; empty: string }> = [
  { value: 'all', label: 'All', empty: 'No transactions yet' },
  { value: 'expenses', label: 'Expenses', empty: 'No expenses recorded' },
  { value: 'income', label: 'Income', empty: 'No income recorded' },
  { value: 'transfers', label: 'Transfers', empty: 'No transfers recorded' },
  { value: 'recurring', label: 'Recurring', empty: 'No recurring payments recorded' },
];

/** The full ledger: search, type tabs, period/account/category filters, and a tap through to each transaction. */
export default function Transactions() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, retry } = useLedger();
  const router = useRouter();
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [text, setText] = useState('');
  const [extra, setExtra] = useState<Pick<TransactionQuery, 'period' | 'accountId' | 'categoryId'>>({ period: 'all', accountId: null, categoryId: null });
  const [sheet, setSheet] = useState(false);
  const query: TransactionQuery = { filter, text, ...extra };
  // Arriving from Insights ("Food is up") opens the list already narrowed to that category this month.
  const params = useLocalSearchParams<{ categoryId?: string; period?: string }>();
  useEffect(() => {
    if (!params.categoryId) return;
    setFilter('all'); setText('');
    setExtra({ period: params.period === 'this_month' ? 'this_month' : 'all', accountId: null, categoryId: params.categoryId });
  }, [params.categoryId, params.period]);
  const nFilters = activeFilterCount(query);
  const narrowed = text.trim().length > 0 || nFilters > 0;

  const all = useMemo(() => (state.status === 'ready' ? describeTransactions(state.snapshot.transactions, state.snapshot.accounts, state.snapshot.categories) : []), [state]);
  const today = state.status === 'ready' ? state.summary.today : '';
  const results = useMemo(() => queryTransactions(all, { filter, text, ...extra }, today, state.status === 'ready' ? state.snapshot.categories : undefined), [all, filter, text, extra, today, state]);
  const sections = useMemo(() => groupByDay(results), [results]);
  const currency = state.status === 'ready' ? state.summary.currency : 'BDT';

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.md }}>
      <OfflineBanner />
      <ScreenTitle title="Transactions" subtitle="Your complete ledger" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.lg }}>
          <Icon name="search" size={18} color={colors.inkMuted} />
          <TextInput value={text} onChangeText={setText} accessibilityLabel="Search transactions" placeholder="Search name, note, account or amount" placeholderTextColor={colors.inkMuted} returnKeyType="search" autoCorrect={false}
            style={{ flex: 1, minHeight: 44, color: colors.ink, fontFamily: fontFamily.medium, fontSize: 16 }} />
          {text ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setText('')} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={18} color={colors.inkMuted} /></Pressable> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={nFilters ? `Filters, ${nFilters} active` : 'Filters'} onPress={() => setSheet(true)}
          style={{ width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: nFilters ? colors.accent : colors.surface, borderWidth: 1, borderColor: nFilters ? colors.accent : colors.border }}>
          <Icon name="list" size={20} color={nFilters ? colors.onAccent : colors.ink} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} accessibilityLabel="Filter transactions">
        {FILTERS.map((f) => <Chip key={f.value} label={f.label} selected={f.value === filter} onPress={() => setFilter(f.value)} />)}
      </ScrollView>
      {narrowed && state.status === 'ready' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} accessibilityLiveRegion="polite">
          <Text variant="callout" tone="muted">{results.length === 1 ? '1 result' : `${results.length} results`}</Text>
          <Button label="Clear all" variant="ghost" onPress={() => { setText(''); setFilter('all'); setExtra({ period: 'all', accountId: null, categoryId: null }); }} />
        </View>
      ) : null}
    </View>
  );

  return (
    <>
    <SectionList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: gutter, paddingBottom: space.huge * 2 }}
      sections={state.status === 'ready' ? sections : []}
      keyExtractor={(i) => i.transaction.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      renderSectionHeader={({ section }) => <Text variant="overline" tone="muted" style={{ paddingTop: space.lg, paddingBottom: space.xs }} accessibilityRole="header">{pastDayLabel(section.date, today)}</Text>}
      renderItem={({ item }) => <TransactionRow item={item} today={today} currency={currency} showDay={false} onPress={() => router.push(`/transaction/${item.transaction.id}`)} />}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border }} />}
      ListEmptyComponent={
        state.status === 'loading' ? <SkeletonLines lines={6} />
        : state.status === 'error' ? <ErrorState onRetry={retry} title="Couldn't load transactions" />
        : narrowed ? <EmptyState icon="search" title="Nothing matches" message="Try different words, or clear the filters." actionLabel="Clear all" onAction={() => { setText(''); setFilter('all'); setExtra({ period: 'all', accountId: null, categoryId: null }); }} />
        : <EmptyState icon="list" title={FILTERS.find((f) => f.value === filter)!.empty} message={filter === 'all' ? 'Tell Nomi what happened from Home. Everything you record shows up here.' : 'Try another filter.'} />
      }
    />
    {state.status === 'ready' ? <FilterSheet visible={sheet} query={query} accounts={state.snapshot.accounts} categories={state.snapshot.categories} onChange={(p) => setExtra((e) => ({ ...e, ...p }))} onClose={() => setSheet(false)} /> : null}
    </>
  );
}
