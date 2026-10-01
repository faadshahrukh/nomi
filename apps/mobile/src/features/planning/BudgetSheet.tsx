import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import type { Budget, Category } from '@nomi/core';
import { fontFamily, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useLedger } from '@/data/LedgerProvider';
import { BottomSheet, Button, Chip, Text, useToast } from '@/components/ui';

/** Create or edit one monthly budget. Each category (or "All spending") has at most one; saving replaces it. */
export function BudgetSheet({ visible, editing, budgets, categories, currency, onClose }: {
  visible: boolean; editing: Budget | null; budgets: Budget[]; categories: Category[]; currency: string; onClose: () => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const { saveBudget, deleteBudget } = useLedger();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCategoryId(editing ? editing.categoryId : null);
    setAmount(editing ? String(editing.amountMinor / 100) : '');
    setErrors([]); setConfirm(false);
  }, [visible, editing]);

  const tops = categories.filter((c) => !c.archivedAt && c.parentId === null && c.kind === 'expense');
  const taken = new Set(budgets.filter((b) => b.id !== editing?.id).map((b) => b.categoryId));
  const choices: Array<{ id: string | null; label: string }> = [{ id: null, label: 'All spending' }, ...tops.map((c) => ({ id: c.id, label: c.name }))].filter((c) => !taken.has(c.id));

  async function save() {
    setBusy(true); setErrors([]);
    try {
      const r = await saveBudget({ categoryId, amountText: amount });
      if (r.ok) { toast.show({ message: 'Budget saved.', tone: 'success' }); onClose(); } else setErrors(r.messages);
    } catch { setErrors(["Couldn't save the budget. Try again."]); } finally { setBusy(false); }
  }
  async function remove() {
    if (!editing) return;
    setBusy(true);
    try { await deleteBudget(editing.id); toast.show({ message: 'Budget removed.', tone: 'neutral' }); onClose(); } catch { setErrors(["Couldn't remove it. Try again."]); setBusy(false); }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={editing ? 'Edit budget' : 'Add a budget'}>
      <View style={{ gap: space.lg }}>
        {editing ? null : (
          <View style={{ gap: space.sm }}>
            <Text variant="callout" weight="semibold">What is it for?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {choices.map((c) => <Chip key={c.id ?? 'all'} label={c.label} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />)}
            </View>
            {choices.length === 0 ? <Text variant="callout" tone="muted">Every category already has a budget. Tap one to change it.</Text> : null}
          </View>
        )}
        <View style={{ gap: space.xs }}>
          <Text variant="callout" weight="semibold">Monthly amount ({currency})</Text>
          <TextInput accessibilityLabel="Budget amount" value={amount} onChangeText={setAmount} keyboardType="numbers-and-punctuation" placeholder="e.g. 30000" placeholderTextColor={colors.inkMuted}
            style={{ minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSunken, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.semibold, fontSize: 18 }} />
        </View>
        {errors.map((m) => <Text key={m} variant="callout" tone="negative" accessibilityRole="alert">{m}</Text>)}
        <Button label="Save budget" size="lg" fullWidth loading={busy && !confirm} onPress={() => void save()} />
        {editing ? (confirm ? (
          <View style={{ gap: space.sm }}>
            <Text variant="callout" tone="muted">Remove this budget? Your transactions are not affected.</Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button label="Keep it" variant="secondary" onPress={() => setConfirm(false)} />
              <Button label="Remove" variant="danger" loading={busy} onPress={() => void remove()} />
            </View>
          </View>
        ) : <Button label="Remove budget" variant="danger" onPress={() => setConfirm(true)} />) : null}
      </View>
    </BottomSheet>
  );
}
