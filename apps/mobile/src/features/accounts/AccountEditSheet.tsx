import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { ACCOUNT_TYPES, type Account, type AccountType } from '@nomi/core';
import { fontFamily, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { useLedger } from '@/data/LedgerProvider';
import { BottomSheet, Button, Chip, Segmented, Text, useToast } from '@/components/ui';

/** Change an account: name, kind, whether it counts as spendable money, and the starting balance. Archiving hides it but keeps its history. */
export function AccountEditSheet({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { editAccount, archiveAccount } = useLedger();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('cash');
  const [liquid, setLiquid] = useState(true);
  const [balance, setBalance] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!account) return;
    setName(account.name); setType(account.type); setLiquid(account.includeInLiquid); setBalance(account.openingBalanceMinor ? String(account.openingBalanceMinor / 100) : ''); setErrors([]);
  }, [account]);
  if (!account) return null;
  const field = { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSunken, color: colors.ink, paddingHorizontal: space.lg, fontFamily: fontFamily.semibold, fontSize: 17 } as const;

  async function save() {
    setBusy(true); setErrors([]);
    try { const r = await editAccount(account!.id, { name, type, includeInLiquid: liquid, openingBalanceText: balance }); if (r.ok) { toast.show({ message: 'Account updated.', tone: 'success' }); onClose(); } else setErrors(r.messages); }
    catch { setErrors(["Couldn't save. Try again."]); } finally { setBusy(false); }
  }
  async function archive() {
    setBusy(true);
    try { const r = await archiveAccount(account!.id, !account!.archivedAt); if (r.ok) { toast.show({ message: account!.archivedAt ? 'Account restored.' : 'Account archived. Its history is kept.', tone: 'neutral' }); onClose(); } else setErrors([r.message]); }
    catch { setErrors(["Couldn't change that. Try again."]); } finally { setBusy(false); }
  }
  return (
    <BottomSheet visible onClose={onClose} title="Edit account">
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.xs }}><Text variant="callout" weight="semibold">Name</Text><TextInput accessibilityLabel="Account name" value={name} onChangeText={setName} style={field} /></View>
        <View style={{ gap: space.sm }}>
          <Text variant="callout" weight="semibold">Type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{ACCOUNT_TYPES.map((t) => <Chip key={t.type} label={t.label} selected={type === t.type} onPress={() => setType(t.type)} />)}</View>
        </View>
        <View style={{ gap: space.xs }}>
          <Text variant="callout" weight="semibold">Starting balance</Text>
          <TextInput accessibilityLabel="Starting balance" value={balance} onChangeText={setBalance} keyboardType="numbers-and-punctuation" placeholder="0" placeholderTextColor={colors.inkMuted} style={field} />
          <Text variant="caption" tone="muted">The balance before your first recorded transaction. Changing it changes the balance shown everywhere.</Text>
        </View>
        <View style={{ gap: space.sm }}>
          <Text variant="callout" weight="semibold">Counts as money you can spend</Text>
          <Segmented<'yes' | 'no'> accessibilityLabel="Counts as money you can spend" value={liquid ? 'yes' : 'no'} onChange={(v) => setLiquid(v === 'yes')} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No, it is savings' }]} />
        </View>
        {errors.map((m) => <Text key={m} variant="callout" tone="negative" accessibilityRole="alert">{m}</Text>)}
        <Button label="Save changes" size="lg" fullWidth loading={busy} onPress={() => void save()} />
        <Button label={account.archivedAt ? 'Restore account' : 'Archive account'} variant="secondary" fullWidth disabled={busy} onPress={() => void archive()} />
      </View>
    </BottomSheet>
  );
}
