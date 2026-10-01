import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { config } from '@/config';
import { space } from '@/design/tokens';
import { useAuth } from '@/auth/AuthProvider';
import { useLedger } from '@/data/LedgerProvider';
import { shareTextFile } from '@/lib/shareFile';
import { Button, ErrorState, Screen, ScreenTitle, Segmented, SkeletonLines, Surface, Text, useToast } from '@/components/ui';

/** Your data, in your hands: what is kept, a full export, and real deletion. Each destructive step asks twice and says exactly what it removes. */
export default function PrivacyScreen() {
  const router = useRouter();
  const toast = useToast();
  const auth = useAuth();
  const { state, mode, retry, updateProfile, exportAll, deleteLocalData } = useLedger();
  const [busy, setBusy] = useState<null | 'json' | 'csv' | 'wipe' | 'account'>(null);
  const [confirm, setConfirm] = useState<null | 'wipe' | 'account'>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  const header = <Button label="Back" variant="ghost" icon="chevronLeft" onPress={back} />;
  if (state.status === 'loading') return <Screen>{header}<SkeletonLines lines={6} /></Screen>;
  if (state.status === 'error') return <Screen>{header}<ErrorState title="Couldn't load this" onRetry={retry} /></Screen>;
  const profile = state.snapshot.profile;
  const demo = mode === 'demo';
  const signedIn = auth.status === 'signedIn';

  async function share(kind: 'json' | 'csv') {
    setBusy(kind);
    try {
      const out = await exportAll();
      const r = kind === 'json' ? await shareTextFile(out.jsonName, out.json, 'application/json') : await shareTextFile(out.csvName, out.csv, 'text/csv');
      toast.show(r === 'shared' ? { message: 'Your export is ready.', tone: 'success' } : { message: "Couldn't open the share sheet on this device.", tone: 'error' });
    } catch { toast.show({ message: "Couldn't create the export. Nothing was changed.", tone: 'error' }); } finally { setBusy(null); }
  }
  async function wipe() {
    setBusy('wipe');
    try { await deleteLocalData(); toast.show({ message: 'Everything on this device was deleted.', tone: 'neutral' }); router.replace('/'); }
    catch { toast.show({ message: "Couldn't delete the data. Nothing was changed.", tone: 'error' }); setBusy(null); setConfirm(null); }
  }
  async function deleteAccount() {
    setBusy('account');
    try {
      await auth.service.deleteAccount();
      await deleteLocalData();
      toast.show({ message: 'Your account and data were deleted.', tone: 'neutral' });
      router.replace('/');
    } catch { toast.show({ message: "Couldn't delete the account. Nothing was changed.", tone: 'error' }); setBusy(null); setConfirm(null); }
  }

  return (
    <Screen>
      {header}
      <ScreenTitle title="Privacy and data" subtitle="What Nomi keeps, and how to take it with you or erase it" />

      <Surface padding="lg" rounded="lg" style={{ gap: space.sm }}>
        <Text variant="bodyStrong">Where your data lives</Text>
        <Text variant="callout" tone="muted">Your accounts, transactions and budgets are stored on this device. Balances and totals are always calculated here, never by AI.</Text>
        <Text variant="callout" tone="muted">{signedIn && config.backendConfigured ? 'You are signed in, so a copy is kept in your private account on the server for backup. Only you can read it.' : 'You are not signed in, so nothing leaves this device except the sentence you type or say when AI understanding is on and you are signed in.'}</Text>
        <Text variant="callout" tone="muted">Voice is turned into text on your phone. Audio is never stored or uploaded.</Text>
      </Surface>

      <Surface padding="lg" rounded="lg" style={{ gap: space.md }}>
        <Text variant="bodyStrong">Keep what I type or say</Text>
        <Segmented<'on' | 'off'> accessibilityLabel="Keep what I type or say" value={profile.retainRawInput ? 'on' : 'off'} onChange={(v) => { void updateProfile({ retainRawInput: v === 'on' }); }}
          options={[{ value: 'off', label: 'Off (recommended)' }, { value: 'on', label: 'On' }]} />
        <Text variant="callout" tone="muted">{profile.retainRawInput ? 'The original sentence is kept with each transaction you add from now on, so you can see what you said. Existing ones are unchanged.' : 'Only the details you confirmed are kept. The sentence itself is thrown away once understood.'}</Text>
      </Surface>

      <Surface padding="lg" rounded="lg" style={{ gap: space.md }}>
        <Text variant="bodyStrong">Export my data</Text>
        <Text variant="callout" tone="muted">A complete copy of everything you have recorded, including deleted entries and the change history. Use the spreadsheet file for Excel or Sheets.</Text>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Button label="Everything (JSON)" variant="secondary" loading={busy === 'json'} disabled={busy !== null} onPress={() => void share('json')} />
          <Button label="Transactions (CSV)" variant="secondary" loading={busy === 'csv'} disabled={busy !== null} onPress={() => void share('csv')} />
        </View>
      </Surface>

      <Surface padding="lg" rounded="lg" style={{ gap: space.md }}>
        <Text variant="bodyStrong">Delete my data</Text>
        {demo ? <Text variant="callout" tone="muted">You are looking at example data, which is not yours. There is nothing to delete.</Text> : confirm === 'wipe' ? (
          <View style={{ gap: space.sm }} accessibilityRole="alert">
            <Text variant="callout">This permanently erases every account, transaction, budget and setting on this device and takes you back to the start. Export first if you want a copy. It cannot be undone.</Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button label="Cancel" variant="secondary" onPress={() => setConfirm(null)} />
              <Button label="Delete everything" variant="danger" loading={busy === 'wipe'} onPress={() => void wipe()} />
            </View>
          </View>
        ) : (
          <>
            <Text variant="callout" tone="muted">Erase everything stored on this device.{signedIn ? ' Your server account is not affected; delete that below.' : ''}</Text>
            <Button label="Delete data on this device" variant="danger" onPress={() => setConfirm('wipe')} />
          </>
        )}
      </Surface>

      {signedIn ? (
        <Surface padding="lg" rounded="lg" style={{ gap: space.md }}>
          <Text variant="bodyStrong">Delete my account</Text>
          {confirm === 'account' ? (
            <View style={{ gap: space.sm }} accessibilityRole="alert">
              <Text variant="callout">This permanently deletes your account and everything stored on the server, and erases the data on this device too. It cannot be undone.</Text>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button label="Cancel" variant="secondary" onPress={() => setConfirm(null)} />
                <Button label="Delete account" variant="danger" loading={busy === 'account'} onPress={() => void deleteAccount()} />
              </View>
            </View>
          ) : (
            <>
              <Text variant="callout" tone="muted">Removes your sign-in and all server-side data, then clears this device.</Text>
              <Button label="Delete my account" variant="danger" onPress={() => setConfirm('account')} />
            </>
          )}
        </Surface>
      ) : null}
    </Screen>
  );
}
