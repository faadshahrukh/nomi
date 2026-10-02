import { useState } from 'react';
import type { Account } from '@nomi/core';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@/design/tokens';
import { useLedger } from '@/data/LedgerProvider';
import { AddAccountSheet } from '@/features/accounts/AddAccountSheet';
import { AccountEditSheet } from '@/features/accounts/AccountEditSheet';
import { Button, ErrorState, ListRow, Money, Screen, ScreenTitle, Surface, Text } from '@/components/ui';
import { ACCOUNT_TYPES } from '@nomi/core';

export default function Accounts() {
  const router = useRouter();
  const { state, retry } = useLedger();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  if (state.status === 'error') return <Screen><ErrorState title="Couldn't load accounts" message="Your data is safe on this device." onRetry={retry} /></Screen>;
  const ready = state.status === 'ready' ? state : null;
  const label = (t: string) => ACCOUNT_TYPES.find((a) => a.type === t)?.label ?? t;
  return (
    <Screen>
      <Button label="Back" variant="ghost" icon="chevronLeft" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
      <ScreenTitle title="Accounts" subtitle="Where your money lives. Balances are worked out from your transactions." />
      {ready ? (
        <>
          {ready.summary.accountBalances.length === 0 ? <Text variant="callout" tone="muted">No accounts yet.</Text> : (
            <Surface padding="sm">
              {ready.summary.accountBalances.map(({ account, balanceMinor }) => (
                <ListRow key={account.id} icon="wallet" title={account.name} subtitle={`${label(account.type)}${account.includeInLiquid ? '' : ' · not counted as spendable'}`} showChevron onPress={() => setEditing(account)}
                  trailing={<Money minor={balanceMinor} currency={account.currency} size="small" />} />
              ))}
            </Surface>
          )}
          {ready.snapshot.accounts.some((a) => a.archivedAt) ? (
            <Surface padding="sm">
              <Text variant="overline" tone="muted" style={{ padding: space.md }}>ARCHIVED</Text>
              {ready.snapshot.accounts.filter((a) => a.archivedAt).map((a) => <ListRow key={a.id} icon="wallet" title={a.name} subtitle="Hidden from pickers. History is kept." showChevron onPress={() => setEditing(a)} />)}
            </Surface>
          ) : null}
          <View style={{ gap: space.sm }}><Button label="Add an account" icon="plus" onPress={() => setAdding(true)} /></View>
          <AccountEditSheet account={editing} onClose={() => setEditing(null)} />
          <AddAccountSheet visible={adding} currency={ready.snapshot.profile.currency} onClose={() => setAdding(false)} />
        </>
      ) : null}
    </Screen>
  );
}
