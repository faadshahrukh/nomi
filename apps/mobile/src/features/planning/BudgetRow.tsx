import { Pressable, View } from 'react-native';
import { formatMoney, roundToWhole, type BudgetStatus, type Category } from '@nomi/core';
import { space } from '@/design/tokens';
import { Badge, ProgressBar, Surface, Text, type BadgeTone, type ProgressTone } from '@/components/ui';

const LOOK: Record<BudgetStatus['state'], { label: string; tone: BadgeTone; bar: ProgressTone; icon: 'check' | 'alert' }> = {
  on_track: { label: 'On track', tone: 'positive', bar: 'accent', icon: 'check' },
  watch: { label: 'Watch', tone: 'caution', bar: 'caution', icon: 'alert' },
  at_risk: { label: 'At risk', tone: 'caution', bar: 'caution', icon: 'alert' },
  over: { label: 'Over budget', tone: 'negative', bar: 'negative', icon: 'alert' },
};

export function BudgetRow({ status, categories, currency, onPress }: { status: BudgetStatus; categories: Category[]; currency: string; onPress?: () => void }) {
  const name = status.budget.categoryId ? categories.find((c) => c.id === status.budget.categoryId)?.name ?? 'Category' : 'All spending';
  const look = LOOK[status.state];
  const m = (n: number) => formatMoney(roundToWhole(Math.abs(n), currency), currency);
  const remaining = status.remainingMinor >= 0 ? `${m(status.remainingMinor)} left` : `${m(status.remainingMinor)} over`;
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? `${name} budget. Tap to edit.` : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
    <Surface style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
        <Text variant="bodyStrong" style={{ flex: 1 }}>{name}</Text>
        <Badge label={look.label} tone={look.tone} icon={look.icon} />
      </View>
      <ProgressBar value={status.usedRatio} tone={look.bar} label={`${name} budget, ${Math.round(status.usedRatio * 100)} percent used`} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
        <Text variant="callout" tone="muted" numeric>{m(status.spentMinor)} of {m(status.budget.amountMinor)}</Text>
        <Text variant="callout" numeric>{remaining}</Text>
      </View>
      {status.state === 'at_risk' || status.state === 'watch' ? (
        <Text variant="caption" tone="muted">At this pace, about {m(status.projectedMinor)} by the end of the month.</Text>
      ) : null}
    </Surface>
    </Pressable>
  );
}
