import { Pressable, View } from 'react-native';
import { formatMoney, roundToWhole, type Category, type HomeSummary } from '@nomi/core';
import { MIN_TOUCH, space } from '@/design/tokens';
import { Badge, EmptyState, Surface, Text } from '@/components/ui';
import { monthRangeLabel } from '@/lib/format';

const REASONS = {
  no_transactions: { title: 'Nothing to compare yet', message: 'Once you have recorded some spending, Nomi can show how this month compares with your usual.' },
  early_in_month: { title: 'Too early to compare', message: 'Nomi waits until about a week into the month so a few days of spending is not mistaken for a trend.' },
  no_complete_baseline_month: { title: 'Needs one full month first', message: 'Nomi compares this month with your earlier full months. It will appear after your first complete month of tracking.' },
} as const;

/** States the change, the numbers and the categories behind it. It never guesses a reason. */
export function WhatChangedCard({ summary, categories, onDriver }: { summary: HomeSummary; categories: Category[]; onDriver?: (categoryId: string) => void }) {
  const wc = summary.whatChanged, c = summary.currency;
  if (wc.status === 'insufficient_data') return <Surface><EmptyState compact {...REASONS[wc.reason]} /></Surface>;
  const name = (id: string | null) => categories.find((x) => x.id === id)?.name ?? 'Uncategorised';
  const money = (n: number) => formatMoney(Math.abs(roundToWhole(n, c)), c);
  const headline = wc.direction === 'similar'
    ? 'This month is in line with your usual pace.'
    : `This month is ${money(wc.deltaMinor)} ${wc.direction} than your usual pace.`;
  return (
    <Surface padding="xl" style={{ gap: space.md }}>
      <Badge tone={wc.direction === 'higher' ? 'caution' : wc.direction === 'lower' ? 'positive' : 'neutral'} icon="insights" label={wc.direction === 'similar' ? 'Steady' : wc.direction === 'higher' ? 'Higher' : 'Lower'} />
      <Text variant="heading">{headline}</Text>
      <Text variant="callout" tone="muted">
        {money(wc.currentMinor)} spent so far this month, compared with {money(wc.baselineMinor)} on average by day {wc.throughDay} in {monthRangeLabel(wc.baselineMonths)}.
      </Text>
      {wc.drivers.length ? (
        <View style={{ gap: space.xs }}>
          {wc.drivers.map((d) => (
            <Pressable key={d.categoryId ?? 'none'} disabled={!onDriver || !d.categoryId} onPress={() => d.categoryId && onDriver?.(d.categoryId)}
              accessibilityRole={onDriver && d.categoryId ? 'button' : undefined}
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, minHeight: MIN_TOUCH, alignItems: 'center' }}
              accessible accessibilityLabel={`${name(d.categoryId)}, ${d.deltaMinor > 0 ? 'up' : 'down'} ${money(d.deltaMinor)} taka, ${d.transactionIds.length} transactions${onDriver && d.categoryId ? '. Opens the transactions.' : ''}`}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>{name(d.categoryId)}</Text>
              <Text variant="bodyStrong" numeric>{d.deltaMinor > 0 ? '+' : '−'}{money(d.deltaMinor)}</Text>
            </Pressable>
          ))}
          {onDriver ? <Text variant="caption" tone="muted">Tap a category to see this month's transactions in it.</Text> : null}
        </View>
      ) : null}
    </Surface>
  );
}
