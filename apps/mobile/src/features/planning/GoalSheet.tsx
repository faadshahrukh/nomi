import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import type { Goal } from '@nomi/core';
import { fontFamily, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useLedger } from '@/data/LedgerProvider';
import { BottomSheet, Button, Text, useToast } from '@/components/ui';

const major = (minor: number | null | undefined) => (minor ? String(minor / 100) : '');

/** Create or edit a savings goal. Goals are never deleted (transactions can refer to them), but any detail can be changed. */
export function GoalSheet({ visible, editing, currency, onClose }: { visible: boolean; editing: Goal | null; currency: string; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { saveGoal } = useLedger();
  const [v, setV] = useState({ name: '', targetText: '', targetDate: '', monthlyText: '', savedText: '' });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setV(editing ? { name: editing.name, targetText: major(editing.targetMinor), targetDate: editing.targetDate ?? '', monthlyText: major(editing.monthlyContributionMinor), savedText: major(editing.openingSavedMinor) } : { name: '', targetText: '', targetDate: '', monthlyText: '', savedText: '' });
    setErrors([]);
  }, [visible, editing]);
  const field = { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSunken, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.semibold, fontSize: 17 } as const;
  const input = (label: string, key: keyof typeof v, placeholder: string, hint?: string) => (
    <View style={{ gap: space.xs }}>
      <Text variant="callout" weight="semibold">{label}</Text>
      <TextInput accessibilityLabel={label} value={v[key]} onChangeText={(t) => setV((x) => ({ ...x, [key]: t }))} placeholder={placeholder} placeholderTextColor={colors.inkMuted}
        keyboardType={key === 'name' || key === 'targetDate' ? 'default' : 'numbers-and-punctuation'} autoCapitalize={key === 'name' ? 'sentences' : 'none'} style={field} />
      {hint ? <Text variant="caption" tone="muted">{hint}</Text> : null}
    </View>
  );
  async function save() {
    setBusy(true); setErrors([]);
    try {
      const r = await saveGoal(v, editing?.id ?? null);
      if (r.ok) { toast.show({ message: editing ? 'Goal updated.' : 'Goal added.', tone: 'success' }); onClose(); } else setErrors(r.messages);
    } catch { setErrors(["Couldn't save the goal. Try again."]); } finally { setBusy(false); }
  }
  return (
    <BottomSheet visible={visible} onClose={onClose} title={editing ? 'Edit goal' : 'Add a goal'}>
      <View style={{ gap: space.lg }}>
        {input('Name', 'name', 'e.g. Emergency fund')}
        {input(`Target amount (${currency})`, 'targetText', 'e.g. 100000')}
        {input('Saved so far (optional)', 'savedText', '0')}
        {input('Put aside each month (optional)', 'monthlyText', 'e.g. 5000', 'Safe to Spend keeps this much aside until it is done. Leave empty to spread it over the time left.')}
        {input('Reach it by (optional)', 'targetDate', 'YYYY-MM-DD')}
        {errors.map((m) => <Text key={m} variant="callout" tone="negative" accessibilityRole="alert">{m}</Text>)}
        <Button label={editing ? 'Save changes' : 'Add goal'} size="lg" fullWidth loading={busy} onPress={() => void save()} />
      </View>
    </BottomSheet>
  );
}
