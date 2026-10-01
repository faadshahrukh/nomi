import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { formatMoney, floorToWhole, type HomeSummary } from '@nomi/core';
import { MIN_TOUCH, space } from '@/design/tokens';
import { Icon, Money, Surface, Text } from '@/components/ui';
import { useTheme } from '@/design/theme';

function Line({ label, minor, currency, sign, strong }: { label: string; minor: number; currency: string; sign?: '+' | '−'; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, minHeight: 28, alignItems: 'center' }}>
      <Text variant={strong ? 'bodyStrong' : 'callout'} tone={strong ? 'ink' : 'muted'} style={{ flex: 1 }}>{label}</Text>
      <Text variant={strong ? 'bodyStrong' : 'callout'} numeric accessibilityLabel={`${sign === '−' ? 'minus ' : ''}${formatMoney(minor, currency, { symbol: false })} taka`}>
        {sign ? `${sign} ` : ''}{formatMoney(minor, currency)}
      </Text>
    </View>
  );
}

/**
 * Decision support, never a promise. The calculation is shown in full so the number can be checked:
 * available balance - upcoming bills - money set aside for goals - safety buffer, spread over the days left.
 */
export function SafeToSpendCard({ summary }: { summary: HomeSummary }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const s = summary.safeToSpend, c = summary.currency;
  const over = s.availableMinor < 0;
  return (
    <Surface padding="xl" style={{ gap: space.md }}>
      <Text variant="caption" tone="muted">{over ? 'Over your safe amount by' : 'You can safely spend'}</Text>
      <Money minor={Math.abs(s.availableMinor)} currency={c} size="hero" rounding="floor" tone={over ? 'caution' : 'ink'} />
      <Text variant="callout" tone="muted">
        {over ? 'Bills, goals and your buffer add up to more than you have available.'
          : `About ${formatMoney(floorToWhole(s.perDayMinor, c), c)} a day for the next ${s.daysRemaining} ${s.daysRemaining === 1 ? 'day' : 'days'}.`}
      </Text>
      <Text variant="caption" tone="muted">Based on your available balance, upcoming bills, current plan and remaining days. An estimate, not a guarantee.</Text>
      <Pressable accessibilityRole="button" aria-expanded={open} onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: MIN_TOUCH }}>
        <Text variant="callout" tone="accent" weight="semibold">How it's calculated</Text>
        <Icon name={open ? 'chevronLeft' : 'chevronRight'} size={16} color={colors.accent} />
      </Pressable>
      {open ? (
        <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md }}>
          <Line label="Available balance" minor={s.liquidMinor} currency={c} />
          <Line label={`Bills due by ${s.periodEnd.slice(8)}/${s.periodEnd.slice(5, 7)}`} minor={s.upcomingMinor} currency={c} sign="−" />
          <Line label="Set aside for goals" minor={s.reservedGoalsMinor} currency={c} sign="−" />
          <Line label="Safety buffer" minor={s.bufferMinor} currency={c} sign="−" />
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.xs }} />
          <Line label="Safe to spend" minor={s.availableMinor} currency={c} strong />
        </View>
      ) : null}
    </Surface>
  );
}
