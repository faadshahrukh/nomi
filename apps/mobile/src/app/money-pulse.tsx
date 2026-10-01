import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatMoney } from '@nomi/core';
import { space } from '@/design/tokens';
import { useLedger } from '@/data/LedgerProvider';
import { Button, EmptyState, ErrorState, ListRow, Money, Screen, ScreenTitle, SkeletonLines, Surface, Text } from '@/components/ui';

function Row({ label, minor, currency, hint }: { label: string; minor: number; currency: string; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, minHeight: 36, alignItems: 'center' }} accessible accessibilityLabel={`${label}, ${formatMoney(minor, currency, { symbol: false })}`}>
      <View style={{ flex: 1 }}><Text variant="callout" tone="muted">{label}</Text>{hint ? <Text variant="caption" tone="muted">{hint}</Text> : null}</View>
      <Text variant="bodyStrong" numeric>{formatMoney(minor, currency)}</Text>
    </View>
  );
}

/** Where the money is and how this month is going. Every number is the core's HomeSummary; nothing is calculated here. */
export default function MoneyPulseScreen() {
  const router = useRouter();
  const { state, retry } = useLedger();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const header = <Button label="Back" variant="ghost" icon="chevronLeft" onPress={back} />;
  if (state.status === 'loading') return <Screen>{header}<SkeletonLines lines={6} /></Screen>;
  if (state.status === 'error') return <Screen>{header}<ErrorState title="Couldn't load this" onRetry={retry} /></Screen>;
  const { summary } = state;
  if (!summary.hasAccounts) return <Screen>{header}<EmptyState icon="wallet" title="Add an account first" message="Money Pulse shows your balances and this month's spending." actionLabel="Add an account" onAction={() => router.push('/accounts')} /></Screen>;
  const p = summary.pulse, c = summary.currency;
  const change = p.balanceChange ? Math.round(p.balanceChange.ratio * 100) : null;
  return (
    <Screen>
      {header}
      <ScreenTitle title="Money Pulse" subtitle="Where you stand right now" />
      <Surface variant="forest" padding="xl" rounded="xl" style={{ gap: space.xs }}>
        <Money minor={p.availableMinor} currency={c} size="hero" tone="onForest" rounding="nearest" />
        <Text variant="callout" tone="onForestMuted">Available balance{change !== null ? `, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on this day last month` : ''}</Text>
      </Surface>

      <Surface padding="lg" rounded="lg" style={{ gap: space.xs }}>
        <Text variant="bodyStrong">This month</Text>
        <Row label="Spent" minor={p.spentMinor} currency={c} hint="Your share of shared costs; transfers and loans are not spending" />
        <Row label="Income" minor={p.incomeMinor} currency={c} />
        <Row label="Net flow" minor={p.netFlowMinor} currency={c} />
        {p.budgetLeftMinor !== null ? <Row label="Left in your monthly budget" minor={p.budgetLeftMinor} currency={c} /> : <Text variant="caption" tone="muted">Set a monthly budget in Planning to see what is left.</Text>}
        {p.vsUsual ? <Text variant="callout" tone="muted" style={{ paddingTop: space.sm }}>Spending is {p.vsUsual.direction === 'similar' ? 'in line with' : `${formatMoney(Math.abs(p.vsUsual.deltaMinor), c)} ${p.vsUsual.direction} than`} your usual pace. See Insights for why.</Text> : null}
      </Surface>

      <Surface padding="sm" rounded="lg">
        <View style={{ paddingHorizontal: space.md, paddingTop: space.md }}><Text variant="bodyStrong">Accounts</Text></View>
        {summary.accountBalances.map(({ account, balanceMinor }) => (
          <ListRow key={account.id} icon="wallet" title={account.name} subtitle={account.includeInLiquid ? 'Counted as available' : 'Not counted as available'} trailing={<Money minor={balanceMinor} currency={account.currency} size="small" />} />
        ))}
      </Surface>
      <View style={{ gap: space.sm }}>
        <Button label="See Safe to Spend" variant="secondary" onPress={() => router.push('/safe-to-spend')} />
        <Button label="Manage accounts" variant="ghost" onPress={() => router.push('/accounts')} />
      </View>
    </Screen>
  );
}
