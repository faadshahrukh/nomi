import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { Budget } from '@nomi/core';
import { formatMoney } from '@nomi/core';
import { BudgetSheet } from '@/features/planning/BudgetSheet';
import { space } from '@/design/tokens';
import { useLedger } from '@/data/LedgerProvider';
import { BudgetRow } from '@/features/planning/BudgetRow';
import { shortDate } from '@/lib/format';
import { Button, Chip, EmptyState, ErrorState, Money, ProgressBar, Screen, ScreenTitle, SkeletonLines, Surface, Text } from '@/components/ui';

type Section = 'Budgets' | 'Goals' | 'Recurring';
const FREQ = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' } as const;

/** Budgets can be added, changed and removed here. Goals and recurring payments are read-only until milestone 10. */
export default function Planning() {
  const { state, retry } = useLedger();
  const [section, setSection] = useState<Section>('Budgets');
  const [sheet, setSheet] = useState<{ open: boolean; editing: Budget | null }>({ open: false, editing: null });
  const ready = state.status === 'ready' ? state : null;
  const c = ready?.summary.currency ?? 'BDT';

  return (
    <Screen>
      <ScreenTitle title="Planning" subtitle="Budgets, goals and what's coming" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} accessibilityLabel="Planning sections">
        {(['Budgets', 'Goals', 'Recurring'] as const).map((s) => <Chip key={s} label={s} selected={s === section} onPress={() => setSection(s)} />)}
      </ScrollView>

      {state.status === 'loading' ? <SkeletonLines lines={5} /> : null}
      {state.status === 'error' ? <ErrorState onRetry={retry} title="Couldn't load your plan" /> : null}

      {ready && section === 'Budgets' ? (ready.summary.budgets.length
        ? <View style={{ gap: space.md }}>
            {ready.summary.budgets.map((b) => <BudgetRow key={b.budget.id} status={b} categories={ready.snapshot.categories} currency={c} onPress={() => setSheet({ open: true, editing: b.budget })} />)}
            <Button label="Add a budget" icon="plus" variant="secondary" onPress={() => setSheet({ open: true, editing: null })} />
          </View>
        : <EmptyState icon="planning" title="No budgets yet" message="Set a monthly budget and Nomi will track it as you spend." actionLabel="Add a budget" onAction={() => setSheet({ open: true, editing: null })} />) : null}
      {ready ? <BudgetSheet visible={sheet.open} editing={sheet.editing} budgets={ready.snapshot.budgets} categories={ready.snapshot.categories} currency={ready.snapshot.profile.currency} onClose={() => setSheet({ open: false, editing: null })} /> : null}

      {ready && section === 'Goals' ? (ready.summary.goals.length
        ? <View style={{ gap: space.md }}>{ready.summary.goals.map((g) => (
            <Surface key={g.goal.id} style={{ gap: space.sm }}>
              <Text variant="bodyStrong">{g.goal.name}</Text>
              <ProgressBar value={g.ratio} label={`${g.goal.name}, ${Math.round(g.ratio * 100)} percent saved`} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                <Text variant="callout" tone="muted" numeric>{formatMoney(g.savedMinor, c)} of {formatMoney(g.goal.targetMinor, c)}</Text>
                <Text variant="callout" numeric>{Math.round(g.ratio * 100)}%</Text>
              </View>
              {g.reservedThisMonthMinor > 0 ? <Text variant="caption" tone="muted">{formatMoney(g.reservedThisMonthMinor, c)} still to set aside this month.</Text> : null}
            </Surface>))}</View>
        : <EmptyState icon="planning" title="No goals yet" message="Add a savings goal and Nomi will keep it in mind when estimating what you can spend." />) : null}

      {ready && section === 'Recurring' ? (ready.summary.recurring.length
        ? <Surface padding="sm"><View style={{ paddingHorizontal: space.md }}>{ready.summary.recurring.map((r) => (
            <View key={r.rule.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60 }} accessible
              accessibilityLabel={`${r.rule.name}, ${FREQ[r.rule.frequency]}, next ${r.nextDate ? shortDate(r.nextDate, ready.summary.today) : 'none'}`}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={1}>{r.rule.name}</Text>
                <Text variant="caption" tone="muted">{FREQ[r.rule.frequency]}{r.nextDate ? ` · next ${shortDate(r.nextDate, ready.summary.today)}` : ''}</Text>
              </View>
              <Money minor={r.rule.amountMinor} currency={c} size="small" />
            </View>))}</View></Surface>
        : <EmptyState icon="planning" title="No recurring payments" message="Bills and subscriptions you add will be tracked here." />) : null}
    </Screen>
  );
}
