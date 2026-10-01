import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { draftFromTransaction, findPossibleDuplicate, finalizeDraft, formatMoney, reviseDraft, validateDraft, describeTransactions, type EditableDraft } from '@nomi/core';
import { space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useLedger } from '@/data/LedgerProvider';
import { userIdFor } from '@/data/repositories';
import { DraftFields } from '@/features/capture/DraftFields';
import type { EditorContext } from '@/features/capture/FieldEditorSheet';
import { Button, EmptyState, ErrorState, Money, Screen, SkeletonLines, Surface, Text, useToast } from '@/components/ui';
import { pastDayLabel } from '@/lib/format';

const SOURCE: Record<string, string> = { manual: 'added by hand', text: 'added by typing', voice: 'added by voice', receipt: 'added from a receipt', import: 'imported', sync: 'synced' };

/** One transaction: see it, correct any field (same editor and validation as capture), or delete it with an Undo. */
export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { state, mode, retry, updateTransaction, undo, restoreTransaction } = useLedger();
  const [draft, setDraft] = useState<EditableDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const tx = state.status === 'ready' ? state.snapshot.transactions.find((t) => t.id === id && !t.deletedAt) ?? null : null;
  const original = useMemo(() => (tx ? draftFromTransaction(tx) : null), [tx]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/transactions'));
  const header = <Button label="Back" variant="ghost" icon="chevronLeft" onPress={back} />;

  if (state.status === 'loading') return <Screen>{header}<SkeletonLines lines={6} /></Screen>;
  if (state.status === 'error') return <Screen>{header}<ErrorState title="Couldn't load this transaction" onRetry={retry} /></Screen>;
  if (!tx || !original) return <Screen>{header}<EmptyState icon="list" title="This transaction isn't here any more" message="It may have been deleted." actionLabel="Back to transactions" onAction={back} /></Screen>;

  const { snapshot, summary } = state;
  const d = draft ?? original;
  const dirty = JSON.stringify(d) !== JSON.stringify(original);
  const data = { accounts: snapshot.accounts, categories: snapshot.categories, people: snapshot.people, transactions: snapshot.transactions };
  const issues = validateDraft(d, userIdFor(mode), data);
  const ctx: EditorContext = { accounts: snapshot.accounts, categories: snapshot.categories, people: snapshot.people, goals: snapshot.goals, today: summary.today, currency: snapshot.profile.currency };
  const item = describeTransactions([tx], snapshot.accounts, snapshot.categories)[0]!;
  const edited = tx.version > 1;

  async function save(allowDuplicate: boolean) {
    setError(null);
    const input = finalizeDraft(d);
    if (!input) { setError('Add an amount first.'); return; }
    if (!allowDuplicate && findPossibleDuplicate(input, snapshot.transactions.filter((t) => t.id !== tx!.id))) { setDuplicate(true); return; }
    setBusy(true);
    const r = await updateTransaction(tx!.id, d).catch(() => ({ ok: false as const, message: "Couldn't save the change. Your original is unchanged." }));
    setBusy(false);
    if (r.ok) { setDraft(null); setDuplicate(false); toast.show({ message: 'Changes saved.', tone: 'success' }); } else setError(r.message);
  }

  async function remove() {
    setBusy(true);
    try {
      await undo(tx!.id);
      toast.show({ message: `Deleted ${formatMoney(tx!.amountMinor, tx!.currency)}.`, tone: 'neutral', actionLabel: 'Undo',
        onAction: () => { restoreTransaction(tx!.id).catch(() => toast.show({ message: "Couldn't bring it back.", tone: 'error' })); } });
      back();
    } catch { setError("Couldn't delete it. Nothing was changed."); setBusy(false); setConfirmDelete(false); }
  }

  return (
    <Screen>
      {header}
      <View style={{ gap: space.xs }}>
        <Text variant="callout" tone="muted">{item.title}</Text>
        <Money minor={item.direction === 'out' ? -tx.amountMinor : tx.amountMinor} currency={tx.currency} size="hero" signed={item.direction === 'in'} />
        <Text variant="caption" tone="muted">{pastDayLabel(tx.localDate, summary.today)} · {SOURCE[tx.source] ?? tx.source}{edited ? ' · edited' : ''}{tx.recurringRuleId ? ' · recurring' : ''}</Text>
      </View>

      <Surface padding="lg" rounded="lg" style={{ gap: space.md }}>
        <DraftFields draft={d} ctx={ctx} issues={issues} onEdit={(patch) => { setDraft(reviseDraft(d, patch, data)); setDuplicate(false); setError(null); }} />
        {duplicate ? (
          <Surface variant="accent" padding="md" style={{ gap: space.sm }} accessibilityRole="alert">
            <Text variant="bodyStrong" style={{ color: colors.onAccentSoft }}>This now matches another transaction you recorded.</Text>
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              <Button label="Save anyway" variant="secondary" onPress={() => void save(true)} />
              <Button label="Keep editing" variant="ghost" onPress={() => setDuplicate(false)} />
            </View>
          </Surface>
        ) : null}
        {error ? <Text variant="callout" tone="negative" accessibilityRole="alert">{error}</Text> : null}
        {dirty && !duplicate ? (
          <View style={{ gap: space.sm }}>
            <Button label="Save changes" size="lg" fullWidth loading={busy} disabled={issues.length > 0} onPress={() => void save(false)} />
            <Button label="Discard changes" variant="ghost" fullWidth onPress={() => { setDraft(null); setError(null); }} />
          </View>
        ) : null}
      </Surface>

      {confirmDelete ? (
        <Surface padding="lg" rounded="lg" style={{ gap: space.md }} accessibilityRole="alert">
          <Text variant="bodyStrong">Delete this transaction?</Text>
          <Text variant="callout" tone="muted">Your balance and Safe to Spend update straight away. You can undo it right after.</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button label="Cancel" variant="secondary" onPress={() => setConfirmDelete(false)} />
            <Button label="Delete" variant="danger" loading={busy} onPress={() => void remove()} />
          </View>
        </Surface>
      ) : <Button label="Delete transaction" variant="danger" onPress={() => setConfirmDelete(true)} />}
    </Screen>
  );
}
