import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { Person } from '@nomi/core';
import { fontFamily, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useLedger } from '@/data/LedgerProvider';
import { Button, Text } from '@/components/ui';

/** A name box and an Add button. Used wherever Nomi needs to know who someone is, so a friend can be added in the moment. */
export function AddPersonInline({ onAdded, label = 'Add' }: { onAdded: (p: Person) => void; label?: string }) {
  const { colors } = useTheme();
  const { savePerson } = useLedger();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true); setErrors([]);
    try { const r = await savePerson(name); if (r.ok) { setName(''); onAdded(r.person); } else setErrors(r.messages); }
    catch { setErrors(["Couldn't save. Try again."]); } finally { setBusy(false); }
  }
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <TextInput accessibilityLabel="Person's name" value={name} onChangeText={setName} placeholder="Name, like Rahim" placeholderTextColor={colors.inkMuted} onSubmitEditing={() => void add()} returnKeyType="done"
          style={{ flex: 1, minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSunken, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.medium, fontSize: 16 }} />
        <Button label={label} accessibilityLabel="Add person" loading={busy} onPress={() => void add()} />
      </View>
      {errors.map((m) => <Text key={m} variant="callout" tone="negative" accessibilityRole="alert">{m}</Text>)}
    </View>
  );
}
