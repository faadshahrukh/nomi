import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { addDays, nextDue, overdueOccurrences, type Budget, type Goal, type RecurringRule } from '@nomi/core';
import { formatMoney } from '@nomi/core';
import { BudgetSheet } from '@/features/planning/BudgetSheet';
import { GoalSheet } from '@/features/planning/GoalSheet';
import { RecurringSheet } from '@/features/recurring/RecurringSheet';
import { space } from '@/design/tokens';
import { useLedger } from '@/data/LedgerProvider';
import { BudgetRow } from '@/features/planning/BudgetRow';
import { shortDate } from '@/lib/format';
import { Badge, Button, Chip, EmptyState, ErrorState, Money, ProgressBar, Screen, ScreenTitle, SkeletonLines, Surface, Text, useToast } from '@/components/ui';

type Section = 'Budgets' | 'Goals' | 'Recurring';
const FREQ = { weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' } as const;

/** Budgets, goals and recurring payments can be added and changed here. */
export default function Planning() {
  const { state, retry } = useLedger();
  const toast = useToast();
  const { markPaid } = useLedger();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>('Budgets');
  useEffect(() => { if (params.section === 'Recurring' || params.section === 'Budgets' || params.section === 'Goals') setSection(params.section); }, [params.section]);
  const [goalSheet, setGoalSheet] = useState<{ open: boolean; editing: Goal | null }>({ open: false, editing: null });
  const [recurring, setRecurring] = useState<{ open: boolean; editing: RecurringRule | null }>({ open: false, editing: null });
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

      {ready && section === 'Goals' ? (
        <View style={{ gap: space.md }}>
          {ready.summary.goals.length ? ready.summary.goals.map((g) => (
            <Pressable key={g.goal.id} accessibilityRole="button" accessibilityLabel={`${g.goal.name} goal. Tap to edit.`} onPress={() => setGoalSheet({ open: true, editing: g.goal })} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
              <Surface style={{ gap: space.sm }}>
                <Text variant="bodyStrong">{g.goal.name}</Text>
                <ProgressBar value={g.ratio} label={`${g.goal.name}, ${Math.round(g.ratio * 100)} percent saved`} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                  <Text variant="callout" tone="muted" numeric>{formatMoney(g.savedMinor, c)} of {formatMoney(g.goal.targetMinor, c)}</Text>
                  <Text variant="callout" numeric>{Math.round(g.ratio * 100)}%</Text>
                </View>
                {g.reservedThisMonthMinor > 0 ? <Text variant="caption" tone="muted">{formatMoney(g.reservedThisMonthMinor, c)} still to set aside this month.</Text> : null}
              </Surface>
            </Pressable>
          )) : <EmptyState icon="planning" title="No goals yet" message="Add a savings goal and Nomi will keep it in mind when estimating what you can spend." actionLabel="Add a goal" onAction={() => setGoalSheet({ open: true, editing: null })} />}
          {ready.summary.goals.length ? <Button label="Add a goal" icon="plus" variant="secondary" onPress={() => setGoalSheet({ open: true, editing: null })} /> : null}
          <GoalSheet visible={goalSheet.open} editing={goalSheet.editing} currency={ready.snapshot.profile.currency} onClose={() => setGoalSheet({ open: false, editing: null })} />
        </View>
      ) : null}

      {ready && section === 'Recurring' ? (() => {
        const today = ready.summary.today, txs = ready.snapshot.transactions;
        const overdue = overdueOccurrences(ready.snapshot.recurringRules, txs, today);
        const pay = async (ruleId: string, date: string) => {
          const r = await markPaid(ruleId, date).catch(() => ({ ok: false as const, message: "Couldn't record the payment." }));
          toast.show(r.ok ? { message: 'Recorded as paid.', tone: 'success' } : { message: r.message, tone: 'error' });
        };
        const rules = ready.snapshot.recurringRules;
        return (
          <View style={{ gap: space.md }}>
            {rules.length ? (
              <Surface padding="sm"><View style={{ paddingHorizontal: space.md }}>{rules.map((r) => {
                const od = overdue.find((o) => o.rule.id === r.id);
                const due = od?.date ?? nextDue(r, txs, today);
                const label = !r.active ? 'Paused' : od ? `Overdue since ${shortDate(od.date, today)}` : due ? `Next ${shortDate(due, today)}` : 'Nothing due';
                return (
                  <View key={r.id} style={{ minHeight: 64, paddingVertical: space.sm, gap: space.xs }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                      <Pressable style={{ flex: 1, minWidth: 0 }} accessibilityRole="button" accessibilityLabel={`${r.name}, ${FREQ[r.frequency]}, ${label}. Tap to edit.`} onPress={() => setRecurring({ open: true, editing: r })}>
                        <Text variant="bodyStrong" numberOfLines={1}>{r.name}</Text>
                        <Text variant="caption" tone="muted">{FREQ[r.frequency]} · {label}</Text>
                      </Pressable>
                      {od ? <Badge label="Overdue" tone="caution" icon="alert" /> : null}
                      <Money minor={r.amountMinor} currency={c} size="small" tone={r.type === 'income' ? 'positive' : 'ink'} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: space.sm }}>
                      {r.active && due && r.type === 'expense' && (od || due <= addDays(today, 7)) ? <Button label="Mark paid" accessibilityLabel={`Mark ${r.name} paid`} variant="secondary" onPress={() => void pay(r.id, due)} /> : null}
                      <Button label="Edit" accessibilityLabel={`Edit ${r.name}`} variant="ghost" onPress={() => setRecurring({ open: true, editing: r })} />
                    </View>
                  </View>
                );
              })}</View></Surface>
            ) : <EmptyState icon="planning" title="No recurring payments" message="Add bills and subscriptions. Nomi counts the unpaid ones in Safe to Spend and tells you before they are due." />}
            <Button label="Add recurring" icon="plus" variant={rules.length ? 'secondary' : 'primary'} onPress={() => setRecurring({ open: true, editing: null })} />
            <RecurringSheet visible={recurring.open} editing={recurring.editing} today={today} onClose={() => setRecurring({ open: false, editing: null })} />
          </View>
        );
      })() : null}
    </Screen>
  );
}
