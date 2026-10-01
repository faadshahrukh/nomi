import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { floorToWhole, formatMoney, type HomeSummary } from '@nomi/core';
import { radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Button, Icon, Money, Surface, Text } from '@/components/ui';

function Check({ label, minor, currency }: { label: string; minor: number; currency: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }} accessible accessibilityLabel={`${label}, ${formatMoney(minor, currency, { symbol: false })} taka`}>
      <Icon name="check" size={13} color={colors.accent} />
      <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>{label}</Text>
      <Text variant="caption" weight="semibold" numeric style={{ flexShrink: 0 }}>{formatMoney(minor, currency)}</Text>
    </View>
  );
}

function Line({ label, minor, currency, sign, strong }: { label: string; minor: number; currency: string; sign?: '−'; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, minHeight: 28, alignItems: 'center' }}>
      <Text variant={strong ? 'bodyStrong' : 'callout'} tone={strong ? 'ink' : 'muted'} style={{ flex: 1 }}>{label}</Text>
      <Text variant={strong ? 'bodyStrong' : 'callout'} numeric accessibilityLabel={`${sign ? 'minus ' : ''}${formatMoney(minor, currency, { symbol: false })} taka`}>{sign ? '− ' : ''}{formatMoney(minor, currency)}</Text>
    </View>
  );
}

/**
 * Decision support, never a promise. The daily amount leads, the three things taken off are always visible, and tapping the
 * card shows the full calculation: available balance - upcoming bills - money set aside for goals - safety buffer, over the days left.
 */
export function SafeToSpendCard({ summary, onDetails }: { summary: HomeSummary; onDetails?: () => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const s = summary.safeToSpend, c = summary.currency;
  const over = s.availableMinor < 0;
  return (
    <Surface variant="mint" padding="lg" rounded="xl" style={{ gap: space.md }}>
      <Pressable accessibilityRole="button" aria-expanded={open} accessibilityLabel={`Safe to Spend. ${over ? 'Over your safe amount' : `${formatMoney(floorToWhole(s.perDayMinor, c), c, { symbol: false })} taka per day`}. ${open ? 'Hide' : 'Show'} how it is calculated.`}
        onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 0.95, minWidth: 0, gap: space.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ width: 28, height: 28, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="shieldCheck" size={16} color={colors.onAccent} />
            </View>
            <Text variant="callout" weight="bold" accessibilityRole="header" numberOfLines={2} style={{ flex: 1 }}>Safe to Spend</Text>
          </View>
          {over ? (
            <>
              <Money minor={Math.abs(s.availableMinor)} currency={c} size="large" tone="caution" rounding="floor" />
              <Text variant="callout" tone="muted">over your safe amount</Text>
            </>
          ) : (
            <>
              <Money minor={s.perDayMinor} currency={c} size="large" rounding="floor" />
              <Text variant="callout" tone="muted">per day</Text>
            </>
          )}
        </View>
        <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: colors.border }} />
        <View style={{ flex: 1.1, minWidth: 0, gap: space.xs }}>
          <Text variant="caption" weight="bold" numberOfLines={2}>After upcoming bills &amp; savings</Text>
          <Check label="Upcoming bills" minor={s.upcomingMinor} currency={c} />
          <Check label="Savings" minor={s.reservedGoalsMinor} currency={c} />
          <Check label="Safety buffer" minor={s.bufferMinor} currency={c} />
        </View>
        <Icon name={open ? 'chevronLeft' : 'chevronRight'} size={16} color={colors.inkMuted} />
      </Pressable>
      {open ? (
        <View style={{ gap: 2, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md }}>
          <Line label="Available balance" minor={s.liquidMinor} currency={c} />
          <Line label="Bills due this month" minor={s.upcomingMinor} currency={c} sign="−" />
          <Line label="Set aside for goals" minor={s.reservedGoalsMinor} currency={c} sign="−" />
          <Line label="Safety buffer" minor={s.bufferMinor} currency={c} sign="−" />
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.xs }} />
          <Line label={`Safe to spend over ${s.daysRemaining} ${s.daysRemaining === 1 ? 'day' : 'days'}`} minor={s.availableMinor} currency={c} strong />
          {onDetails ? <Button label="Details and safety buffer" variant="secondary" onPress={onDetails} /> : null}
          <Text variant="caption" tone="muted" style={{ paddingTop: space.sm }}>Based on your available balance, upcoming bills, current plan and remaining days. An estimate, not a guarantee.</Text>
        </View>
      ) : null}
    </Surface>
  );
}
