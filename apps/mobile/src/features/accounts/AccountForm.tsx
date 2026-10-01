import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { ACCOUNT_TYPES, suggestAccountName, type AccountType, type CurrencyCode } from '@nomi/core';
import { fontFamily, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useLedger } from '@/data/LedgerProvider';
import { Button, Chip, Text } from '@/components/ui';

/** Type chips, a name that is pre-filled, and an optional opening balance. Validation lives in the core. */
export function AccountForm({ currency, submitLabel = 'Add account', onAdded }: { currency: CurrencyCode; submitLabel?: string; onAdded: () => void }) {
  const { colors } = useTheme();
  const { addAccount } = useLedger();
  const [type, setType] = useState<AccountType>('cash');
  const [name, setName] = useState(suggestAccountName('cash', currency));
  const [nameEdited, setNameEdited] = useState(false);
  const [balance, setBalance] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const pick = (t: AccountType) => { setType(t); if (!nameEdited) setName(suggestAccountName(t, currency)); };
  const input = { flex: 1, minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.medium, fontSize: 16 } as const;

  async function submit() {
    setBusy(true); setErrors([]);
    try {
      const r = await addAccount({ name, type, balanceText: balance });
      if (r.ok) { setName(suggestAccountName(type, currency)); setNameEdited(false); setBalance(''); onAdded(); } else setErrors(r.messages);
    } catch { setErrors(["Couldn't save the account. Try again."]); } finally { setBusy(false); }
  }

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <Text variant="callout" weight="semibold">Type</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {ACCOUNT_TYPES.map((t) => <Chip key={t.type} label={t.label} selected={type === t.type} onPress={() => pick(t.type)} />)}
        </View>
      </View>
      <View style={{ gap: space.xs }}>
        <Text variant="callout" weight="semibold">Name</Text>
        <TextInput accessibilityLabel="Account name" value={name} onChangeText={(v) => { setName(v); setNameEdited(true); }} placeholderTextColor={colors.inkMuted} style={input} />
      </View>
      <View style={{ gap: space.xs }}>
        <Text variant="callout" weight="semibold">Balance right now (optional)</Text>
        <TextInput accessibilityLabel="Opening balance" value={balance} onChangeText={setBalance} keyboardType="numbers-and-punctuation" placeholder="0" placeholderTextColor={colors.inkMuted} style={input} />
        <Text variant="caption" tone="muted">An estimate is fine. You can leave it empty.</Text>
      </View>
      {errors.map((m) => <Text key={m} variant="callout" tone="negative" accessibilityRole="alert">{m}</Text>)}
      <Button label={submitLabel} size="lg" fullWidth loading={busy} onPress={submit} />
    </View>
  );
}
