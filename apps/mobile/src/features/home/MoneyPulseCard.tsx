import { View } from 'react-native';
import type { HomeSummary } from '@nomi/core';
import { space } from '@/design/tokens';
import { Badge, Money, ProgressBar, Surface, Text } from '@/components/ui';

function Stat({ label, minor, currency, tone }: { label: string; minor: number; currency: string; tone?: 'ink' | 'positive' }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: space.xxs }}>
      <Text variant="caption" tone="muted" numberOfLines={1}>{label}</Text>
      <Money minor={minor} currency={currency} size="medium" tone={tone ?? 'ink'} rounding="nearest" />
    </View>
  );
}

/** "How am I doing right now?" Figures come from the core's HomeSummary; this component only lays them out. */
export function MoneyPulseCard({ summary }: { summary: HomeSummary }) {
  const p = summary.pulse, c = summary.currency;
  const savedRatio = p.goalsTargetMinor > 0 ? p.savedMinor / p.goalsTargetMinor : 0;
  const v = p.vsUsual;
  return (
    <Surface padding="xl" rounded="lg" style={{ gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <Text variant="caption" tone="muted">Available balance</Text>
        <Money minor={p.availableMinor} currency={c} size="hero" rounding="nearest" />
      </View>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Stat label="Spent this month" minor={p.spentMinor} currency={c} />
        <Stat label="Income" minor={p.incomeMinor} currency={c} tone="positive" />
        {p.budgetLeftMinor !== null ? <Stat label="Budget left" minor={p.budgetLeftMinor} currency={c} /> : <Stat label="Net cash flow" minor={p.netFlowMinor} currency={c} />}
      </View>
      {v && v.direction !== 'similar' ? (
        <View style={{ gap: space.xs }}>
          <Badge tone={v.direction === 'higher' ? 'caution' : 'positive'} icon="insights" label={v.direction === 'higher' ? 'Higher than your usual pace' : 'Lower than your usual pace'} />
        </View>
      ) : v ? <Badge tone="positive" icon="check" label="In line with your usual pace" /> : null}
      {p.goalsTargetMinor > 0 ? (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
            <Text variant="callout" tone="muted">Savings goals</Text>
            <Text variant="callout" numeric>{Math.round(savedRatio * 100)}%</Text>
          </View>
          <ProgressBar value={savedRatio} label={`Savings goals, ${Math.round(savedRatio * 100)} percent saved`} />
        </View>
      ) : null}
    </Surface>
  );
}
