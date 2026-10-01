import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatMoney, type SyncConflict, type Transaction } from '@nomi/core';
import { space } from '@/design/tokens';
import { useLedger } from '@/data/LedgerProvider';
import { useSync } from '@/sync/SyncProvider';
import { useOnline } from '@/providers/NetworkProvider';
import { friendlyDate } from '@/lib/format';
import { Badge, Button, Screen, ScreenTitle, Surface, Text, useToast } from '@/components/ui';

const WHY = { not_configured: "Backup isn't set up in this version of the app.", signed_out: 'Sign in to back up your data and use it on more than one phone.', demo: 'You are looking at example data. Nothing is backed up.' } as const;

function describe(t: Transaction, categories: Array<{ id: string; name: string }>) {
  const cat = categories.find((c) => c.id === t.categoryId)?.name;
  return [formatMoney(t.amountMinor, t.currency), t.deletedAt ? 'deleted' : null, t.merchantName ?? cat ?? null, friendlyDate(t.localDate)].filter(Boolean).join(' · ');
}

function ConflictCard({ c, categories, onResolve, busy }: { c: SyncConflict; categories: Array<{ id: string; name: string }>; busy: boolean; onResolve: (choice: 'keep_server' | 'use_mine') => void }) {
  return (
    <Surface padding="lg" rounded="lg" style={{ gap: space.md }} accessibilityRole="alert">
      <Text variant="bodyStrong">Changed on two phones</Text>
      <View style={{ gap: space.xs }}>
        <Text variant="caption" tone="muted">YOUR VERSION (this phone)</Text>
        <Text variant="callout">{describe(c.local, categories)}</Text>
        <Text variant="caption" tone="muted" style={{ paddingTop: space.xs }}>THE OTHER VERSION (shown in your ledger now)</Text>
        <Text variant="callout">{describe(c.remote, categories)}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Button label="Keep the other version" variant="secondary" disabled={busy} onPress={() => onResolve('keep_server')} />
        <Button label="Use my version" disabled={busy} onPress={() => onResolve('use_mine')} />
      </View>
    </Surface>
  );
}

/** Backup and sync: what state it is in, what is waiting, and the rare change that needs a person to choose. */
export default function SyncScreen() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const { state } = useLedger();
  const s = useSync();
  const [busy, setBusy] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
  const categories = state.status === 'ready' ? state.snapshot.categories : [];
  const label = s.status === 'off' ? 'Not backing up' : s.status === 'syncing' ? 'Syncing…' : s.status === 'offline' ? 'Offline' : s.status === 'failed' ? "Couldn't reach the server" : s.status === 'wrong_account' ? 'Different account' : s.pending ? 'Waiting to sync' : 'Up to date';
  const tone = s.status === 'idle' && !s.pending ? 'positive' : s.status === 'off' ? 'neutral' : 'caution';

  async function resolve(id: string, choice: 'keep_server' | 'use_mine') {
    setBusy(true);
    const r = await s.resolveConflict(id, choice).catch(() => ({ ok: false as const, message: "Couldn't apply that. Nothing was changed." }));
    setBusy(false);
    toast.show(r.ok ? { message: 'Done.', tone: 'success' } : { message: r.message, tone: 'error' });
  }

  return (
    <Screen>
      <Button label="Back" variant="ghost" icon="chevronLeft" onPress={back} />
      <ScreenTitle title="Backup and sync" subtitle="Your records stay on this phone and work without a connection" />
      <Surface padding="lg" rounded="lg" style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
          <Text variant="bodyStrong" accessibilityLiveRegion="polite">{label}</Text>
          <Badge label={s.status === 'off' ? 'Off' : s.status === 'idle' && !s.pending ? 'Backed up' : online === false ? 'Offline' : 'Pending'} tone={tone} />
        </View>
        {s.offReason ? <Text variant="callout" tone="muted">{WHY[s.offReason]}</Text> : (
          <>
            <Text variant="callout" tone="muted">{s.pending ? `${s.pending} ${s.pending === 1 ? 'change is' : 'changes are'} waiting to be sent.` : 'Everything on this phone is backed up.'}{s.lastSyncedAt ? ` Last synced ${new Date(s.lastSyncedAt).toLocaleString()}.` : ''}</Text>
            {s.rejected ? <Text variant="callout" tone="caution" accessibilityRole="alert">{s.rejected} {s.rejected === 1 ? 'change was' : 'changes were'} refused by the server and will be retried. Your data on this phone is safe.</Text> : null}
            {s.status === 'wrong_account' ? <Text variant="callout" tone="caution" accessibilityRole="alert">This phone's data belongs to a different account, so nothing is sent or received. Sign in to the original account, or delete the data on this phone in Privacy and data.</Text> : null}
            <Button label="Sync now" variant="secondary" loading={s.status === 'syncing'} disabled={s.status === 'syncing'} onPress={() => void s.syncNow()} />
          </>
        )}
      </Surface>

      {s.conflicts.map((c) => <ConflictCard key={c.id} c={c} categories={categories} busy={busy} onResolve={(choice) => void resolve(c.id, choice)} />)}

      <Surface padding="lg" rounded="lg" style={{ gap: space.sm }}>
        <Text variant="bodyStrong">What is backed up</Text>
        <Text variant="callout" tone="muted">Accounts, transactions, budgets, recurring bills, goals, people and your settings are kept in your private account. Only you can read them.</Text>
        <Text variant="callout" tone="muted">Not synced, because they belong to this phone: reminders, dismissed Radar items, which account is your default, and the change history.</Text>
        <Text variant="callout" tone="muted">If two phones change the same transaction, small wording differences are merged. If an amount, date or account differs, you choose here.</Text>
      </Surface>
    </Screen>
  );
}
