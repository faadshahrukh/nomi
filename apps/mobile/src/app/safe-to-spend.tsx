import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { floorToWhole, formatMoney } from '@nomi/core';
import { fontFamily, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useLedger } from '@/data/LedgerProvider';
import { Button, EmptyState, ErrorState, Money, Screen, ScreenTitle, SkeletonLines, Surface, Text, useToast } from '@/components/ui';
import { monthDay } from '@/lib/format';

function Line({ label, sub, minor, currency, sign, strong }: { label: string; sub?: string; minor: number; currency: string; sign?: boolean; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, minHeight: 32, alignItems: 'center' }} accessible
      accessibilityLabel={`${label}, ${sign ? 'minus ' : ''}${formatMoney(minor, currency, { symbol: false })}`}>
      <View style={{ flex: 1 }}>
        <Text variant={strong ? 'bodyStrong' : 'callout'} tone={strong ? 'ink' : 'muted'}>{label}</Text>
        {sub ? <Text variant="caption" tone="muted">{sub}</Text> : null}
      </View>
      <Text variant={strong ? 'bodyStrong' : 'callout'} numeric>{sign ? '− ' : ''}{formatMoney(minor, currency)}</Text>
    </View>
  );
}

/** The whole calculation, itemised, with the one input the user controls: the safety buffer. Every figure comes from the core. */
export default function SafeToSpendScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { state, retry, setSafetyBuffer } = useLedger();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const header = <Button label="Back" variant="ghost" icon="chevronLeft" onPress={back} />;

  if (state.status === 'loading') return <Screen>{header}<SkeletonLines lines={6} /></Screen>;
  if (state.status === 'error') return <Screen>{header}<ErrorState title="Couldn't load this" onRetry={retry} /></Screen>;
  const { summary, snapshot } = state;
  if (!summary.hasAccounts) return <Screen>{header}<EmptyState icon="shield" title="Add an account first" message="Safe to Spend starts from the money you have in your accounts." actionLabel="Add an account" onAction={() => router.push('/accounts')} /></Screen>;
  const s = summary.safeToSpend, c = summary.currency;
  const over = s.availableMinor < 0;
  const bufferText = text ?? (s.bufferMinor ? String(s.bufferMinor / 100) : '');
  const changed = text !== null && text.trim() !== (s.bufferMinor ? String(s.bufferMinor / 100) : '');

  async function saveBuffer() {
    setBusy(true); setError(null);
    const r = await setSafetyBuffer(bufferText).catch(() => ({ ok: false as const, message: "Couldn't save that. Try again." }));
    setBusy(false);
    if (r.ok) { setText(null); toast.show({ message: 'Safety buffer saved.', tone: 'success' }); } else setError(r.message);
  }

  return (
    <Screen>
      {header}
      <ScreenTitle title="Safe to Spend" subtitle={`Until ${monthDay(s.periodEnd)}, ${s.daysRemaining} ${s.daysRemaining === 1 ? 'day' : 'days'} left`} />
      <Surface variant="mint" padding="xl" rounded="xl" style={{ gap: space.xs }}>
        {over ? (<><Money minor={Math.abs(s.availableMinor)} currency={c} size="hero" tone="caution" rounding="floor" /><Text variant="callout" tone="muted">over your safe amount. Bills and savings plans come to more than you have available.</Text></>)
          : (<><Money minor={s.perDayMinor} currency={c} size="hero" rounding="floor" /><Text variant="callout" tone="muted">per day, about {formatMoney(floorToWhole(Math.max(0, s.availableMinor), c), c)} in total</Text></>)}
      </Surface>

      <Surface padding="lg" rounded="lg" style={{ gap: space.xs }}>
        <Text variant="bodyStrong">How it's worked out</Text>
        <Line label="Available balance" sub="Accounts counted as spendable" minor={s.liquidMinor} currency={c} />
        <Line label="Bills still due" sub={s.upcoming.length ? `${s.upcoming.length} unpaid this month` : 'None unpaid this month'} minor={s.upcomingMinor} currency={c} sign />
        <Line label="Set aside for goals" minor={s.reservedGoalsMinor} currency={c} sign />
        <Line label="Safety buffer" sub="Kept untouched, set below" minor={s.bufferMinor} currency={c} sign />
        <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.xs }} />
        <Line label="Safe to spend" minor={s.availableMinor} currency={c} strong />
        <Text variant="caption" tone="muted" style={{ paddingTop: space.sm }}>An estimate to help you decide, not a guarantee. Recorded income and bills change it.</Text>
      </Surface>

      {s.upcoming.length ? (
        <Surface padding="lg" rounded="lg" style={{ gap: space.xs }}>
          <Text variant="bodyStrong">Bills counted</Text>
          {s.upcoming.map((u) => <Line key={`${u.rule.id}-${u.date}`} label={u.rule.name} sub={monthDay(u.date)} minor={u.amountMinor} currency={c} />)}
        </Surface>
      ) : null}

      {s.goalReserves.some((g) => g.reservedMinor > 0) ? (
        <Surface padding="lg" rounded="lg" style={{ gap: space.xs }}>
          <Text variant="bodyStrong">Goals counted</Text>
          {s.goalReserves.filter((g) => g.reservedMinor > 0).map((g) => <Line key={g.goalId} label={g.name} sub={`${formatMoney(g.contributedMinor, c)} of ${formatMoney(g.requiredMinor, c)} set aside this month`} minor={g.reservedMinor} currency={c} />)}
        </Surface>
      ) : null}

      <Surface padding="lg" rounded="lg" style={{ gap: space.md }}>
        <Text variant="bodyStrong">Safety buffer</Text>
        <Text variant="callout" tone="muted">Money you want to keep out of Safe to Spend, for surprises. Leave it empty for none.</Text>
        <TextInput accessibilityLabel="Safety buffer" value={bufferText} onChangeText={(v) => { setText(v); setError(null); }} keyboardType="numbers-and-punctuation" placeholder="0" placeholderTextColor={colors.inkMuted}
          style={{ minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSunken, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.semibold, fontSize: 18 }} />
        {error ? <Text variant="callout" tone="negative" accessibilityRole="alert">{error}</Text> : null}
        {changed ? <Button label="Save buffer" loading={busy} onPress={() => void saveBuffer()} /> : null}
      </Surface>
      <Text variant="caption" tone="muted">{snapshot.profile.currency} · calculated on your device from your own records.</Text>
    </Screen>
  );
}
