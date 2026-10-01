import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { addDays, type RecurringInput, type RecurringRule } from '@nomi/core';
import { fontFamily, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useLedger } from '@/data/LedgerProvider';
import { BottomSheet, Button, Chip, Text, useToast } from '@/components/ui';

const FREQ: Array<{ value: RecurringRule['frequency']; label: string }> = [{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }];

/** Add or change a recurring bill or income. Validation is the core's; this only collects the fields. */
export function RecurringSheet({ visible, editing, today, onClose }: { visible: boolean; editing: RecurringRule | null; today: string; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { state, saveRecurring, setRecurringActive } = useLedger();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<RecurringRule['frequency']>('monthly');
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const snap = state.status === 'ready' ? state.snapshot : null;
  useEffect(() => {
    if (!visible || !snap) return;
    const r = editing;
    setType(r?.type ?? 'expense'); setName(r?.name ?? ''); setAmount(r ? String(r.amountMinor / 100) : ''); setCategoryId(r?.categoryId ?? null);
    setAccountId(r?.accountId ?? snap.profile.defaultAccountId ?? snap.accounts.find((a) => !a.archivedAt)?.id ?? null);
    setFrequency(r?.frequency ?? 'monthly'); setDate(r?.anchorDate ?? today); setErrors([]);
  }, [visible, editing, snap, today]);
  if (!snap) return null;

  const cats = snap.categories.filter((c) => !c.archivedAt && c.parentId === null && c.kind === type);
  const input: RecurringInput = { name, type, amountText: amount, accountId, categoryId, frequency, interval: editing?.interval ?? 1, anchorDate: date.trim(), endDate: editing?.endDate ?? null, isBill: type === 'expense' };
  const field = { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSunken, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.semibold, fontSize: 17 } as const;

  async function save() {
    setBusy(true); setErrors([]);
    try {
      const r = await saveRecurring(input, editing?.id ?? null);
      if (r.ok) { toast.show({ message: editing ? 'Changes saved.' : 'Added.', tone: 'success' }); onClose(); } else setErrors(r.messages);
    } catch { setErrors(["Couldn't save. Try again."]); } finally { setBusy(false); }
  }
  async function togglePause() {
    if (!editing) return;
    setBusy(true);
    try { await setRecurringActive(editing.id, !editing.active); toast.show({ message: editing.active ? 'Paused. It will not come due until you resume it.' : 'Resumed.', tone: 'neutral' }); onClose(); } catch { setErrors(["Couldn't change that. Try again."]); setBusy(false); }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={editing ? 'Edit recurring' : 'Add recurring'}>
      <View style={{ gap: space.lg }}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Chip label="Bill or expense" selected={type === 'expense'} onPress={() => { setType('expense'); setCategoryId(null); }} />
          <Chip label="Income" selected={type === 'income'} onPress={() => { setType('income'); setCategoryId(null); }} />
        </View>
        <View style={{ gap: space.xs }}>
          <Text variant="callout" weight="semibold">Name</Text>
          <TextInput accessibilityLabel="Name" value={name} onChangeText={setName} placeholder={type === 'income' ? 'e.g. Salary' : 'e.g. Internet'} placeholderTextColor={colors.inkMuted} style={field} />
        </View>
        <View style={{ gap: space.xs }}>
          <Text variant="callout" weight="semibold">Amount ({snap.profile.currency})</Text>
          <TextInput accessibilityLabel="Amount" value={amount} onChangeText={setAmount} keyboardType="numbers-and-punctuation" placeholder="e.g. 1200" placeholderTextColor={colors.inkMuted} style={field} />
        </View>
        <View style={{ gap: space.sm }}>
          <Text variant="callout" weight="semibold">{type === 'income' ? 'Paid into' : 'Paid from'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {snap.accounts.filter((a) => !a.archivedAt).map((a) => <Chip key={a.id} label={a.name} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />)}
          </View>
        </View>
        <View style={{ gap: space.sm }}>
          <Text variant="callout" weight="semibold">Category (optional)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Chip label="None" selected={!categoryId} onPress={() => setCategoryId(null)} />
            {cats.map((c) => <Chip key={c.id} label={c.name} selected={categoryId === c.id} onPress={() => setCategoryId(c.id)} />)}
          </View>
        </View>
        <View style={{ gap: space.sm }}>
          <Text variant="callout" weight="semibold">Repeats</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>{FREQ.map((f) => <Chip key={f.value} label={f.label} selected={frequency === f.value} onPress={() => setFrequency(f.value)} />)}</View>
        </View>
        <View style={{ gap: space.sm }}>
          <Text variant="callout" weight="semibold">{editing ? 'A due date to count from' : 'First due date'}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Chip label="Today" selected={date === today} onPress={() => setDate(today)} />
            <Chip label="Tomorrow" selected={date === addDays(today, 1)} onPress={() => setDate(addDays(today, 1))} />
            <Chip label="In a week" selected={date === addDays(today, 7)} onPress={() => setDate(addDays(today, 7))} />
          </View>
          <TextInput accessibilityLabel="Due date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.inkMuted} autoCapitalize="none" style={field} />
        </View>
        {errors.map((m) => <Text key={m} variant="callout" tone="negative" accessibilityRole="alert">{m}</Text>)}
        <Button label={editing ? 'Save changes' : 'Add'} size="lg" fullWidth loading={busy} onPress={() => void save()} />
        {editing ? <Button label={editing.active ? 'Pause' : 'Resume'} variant="secondary" fullWidth onPress={() => void togglePause()} /> : null}
      </View>
    </BottomSheet>
  );
}
