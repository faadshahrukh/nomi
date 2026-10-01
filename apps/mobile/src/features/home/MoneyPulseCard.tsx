import { Pressable, View } from 'react-native';
import type { HomeSummary } from '@nomi/core';
import { radius, space } from '@/design/tokens';
import { Icon, Money, Surface, Text, type IconName } from '@/components/ui';

function Stat({ icon, label, minor, currency }: { icon: IconName; label: string; minor: number; currency: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: space.sm }}>
      <View style={{ width: 34, height: 34, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={17} color="#FFFFFF" />
      </View>
      <View style={{ gap: 2 }}>
        <Text variant="caption" tone="onForestMuted" numberOfLines={1}>{label}</Text>
        <Money minor={minor} currency={currency} size="medium" tone="onForest" rounding="nearest" />
      </View>
    </View>
  );
}

/** "How am I doing right now?" Figures come from the core's HomeSummary; this component only lays them out. */
export function MoneyPulseCard({ summary, onDetails }: { summary: HomeSummary; onDetails: () => void }) {
  const p = summary.pulse, c = summary.currency;
  const change = p.balanceChange ? Math.round(p.balanceChange.ratio * 100) : null;
  return (
    <Surface variant="forest" padding="xl" rounded="xl" style={{ gap: space.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name="insights" size={18} color="#FFFFFF" />
          <Text variant="bodyStrong" tone="onForest" accessibilityRole="header">Money Pulse</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="View details" onPress={onDetails} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Text variant="caption" weight="semibold" tone="onForest">View details</Text>
          <Icon name="chevronRight" size={14} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Money minor={p.availableMinor} currency={c} size="hero" tone="onForest" rounding="nearest" />
          <Text variant="callout" tone="onForestMuted">Available balance</Text>
        </View>
        {change !== null ? (
          <View accessible accessibilityLabel={`Balance ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)} percent compared with this day last month`} style={{ alignItems: 'flex-end', gap: 2, paddingBottom: space.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <Icon name={change >= 0 ? 'trendUp' : 'arrowDown'} size={16} color={change >= 0 ? '#8FE3BC' : '#B9D6CA'} />
              <Text variant="bodyStrong" tone={change >= 0 ? 'forestPositive' : 'onForestMuted'} numeric>{change >= 0 ? '+' : '−'}{Math.abs(change)}%</Text>
            </View>
            <Text variant="caption" tone="onForestMuted">vs last month</Text>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: space.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.14)', paddingTop: space.lg }}>
        <Stat icon="cart" label="Spent" minor={p.spentMinor} currency={c} />
        <Stat icon="arrowDown" label="Income" minor={p.incomeMinor} currency={c} />
        {p.budgetLeftMinor !== null ? <Stat icon="wallet" label="Budget left" minor={p.budgetLeftMinor} currency={c} /> : <Stat icon="trendUp" label="Net flow" minor={p.netFlowMinor} currency={c} />}
      </View>
    </Surface>
  );
}
