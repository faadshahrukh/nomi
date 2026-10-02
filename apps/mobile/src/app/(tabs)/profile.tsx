import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@/design/tokens';
import { useTheme, type SchemePreference } from '@/design/theme';
import { useAuth } from '@/auth/AuthProvider';
import { config } from '@/config';
import { useLedger } from '@/data/LedgerProvider';
import { useSync } from '@/sync/SyncProvider';
import type { DataMode } from '@/data/repositories';
import { Icon, ListRow, Screen, SectionHeader, Segmented, Surface, Text, useToast } from '@/components/ui';
import { radius } from '@/design/tokens';

export const SHOW_DEV_TOOLS = __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === '1';

export default function Profile() {
  const { preference, setPreference } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const { mode, setMode, state, updateProfile } = useLedger();
  const { colors } = useTheme();
  const name = state.status === 'ready' ? state.snapshot.profile.displayName : null;
  const auth = useAuth();
  const sync = useSync();
  const aiOn = state.status === 'ready' ? state.snapshot.profile.aiProcessing : true;
  const aiStatus = !config.backendConfigured ? "AI understanding isn't set up in this build, so messages are understood on this device."
    : !aiOn ? 'Messages are understood on this device only and never leave it.'
    : auth.status === 'signedIn' ? 'Your message is sent securely to an AI service to be understood. Only the sentence and the names of your accounts, categories and people are sent. Balances and history never are.'
    : 'AI understanding starts when you sign in. Until then messages stay on this device.';
  return (
    <Screen>
      <Surface padding="lg" rounded="xl" style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        <View style={{ width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          {name ? <Text variant="title" style={{ color: colors.onAccentSoft }}>{name.slice(0, 1).toUpperCase()}</Text> : <Icon name="user" size={26} color={colors.onAccentSoft} />}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="heading" weight="bold" accessibilityRole="header" numberOfLines={1}>{name ?? 'Your profile'}</Text>
          <Text variant="callout" tone="muted" numberOfLines={1}>{auth.session?.user.email ?? (auth.status === 'signedIn' ? 'Signed in' : 'Not signed in. Your data stays on this device.')}</Text>
        </View>
      </Surface>

      <View style={{ gap: space.xs }}>
        <SectionHeader title="Appearance" />
        <Surface style={{ gap: space.md }}>
          <Text variant="callout" tone="muted">Theme</Text>
          <Segmented<SchemePreference> accessibilityLabel="Theme" value={preference} onChange={setPreference}
            options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Surface>
      </View>

      <View style={{ gap: space.xs }}>
        <SectionHeader title="Privacy" />
        <Surface style={{ gap: space.md }}>
          <Text variant="bodyStrong">Use AI to understand messages</Text>
          <Segmented<'on' | 'off'> accessibilityLabel="Use AI to understand messages" value={aiOn ? 'on' : 'off'}
            onChange={(v) => { if (state.status === 'ready') void updateProfile({ aiProcessing: v === 'on' }); }}
            options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
          <Text variant="callout" tone="muted" aria-live="polite">{aiStatus}</Text>
          <Text variant="caption" tone="muted">Amounts, totals and balances are always calculated on your device, never by AI.</Text>
        </Surface>
      </View>

      <View style={{ gap: space.xs }}>
        <SectionHeader title="Account" />
        <Surface padding="sm" style={{ gap: space.xs }}>
          {auth.status === 'signedIn' ? (
            <>
              <ListRow icon="user" title="Sign out" subtitle="Your data stays on this device" showChevron onPress={() => { auth.service.signOut().catch(() => toast.show({ message: "Couldn't sign out. Try again.", tone: 'error' })); }} />
            </>
          ) : (
            <ListRow icon="user" title="Sign in or create an account" subtitle={config.backendConfigured ? 'Optional. Backs up your data and turns on AI understanding.' : "Not set up in this version"} showChevron onPress={() => router.push('/auth')} />
          )}
          <ListRow icon="shield" title="Backup and sync" showChevron onPress={() => router.push('/sync')}
            subtitle={sync.conflicts.length ? `${sync.conflicts.length} to look at` : sync.status === 'off' ? 'Off' : sync.status === 'offline' ? 'Offline, will sync later' : sync.pending ? `${sync.pending} waiting` : 'Up to date'} />
        </Surface>
      </View>

      <View style={{ gap: space.xs }}>
        <SectionHeader title="Settings" />
        <Surface padding="sm">
          <ListRow icon="wallet" title="Accounts" subtitle="Cash, bank, cards, mobile wallets" showChevron onPress={() => router.push('/accounts')} />
          <ListRow icon="tag" title="Categories" subtitle="Edit how spending is grouped" showChevron onPress={() => router.push('/categories')} />
          <ListRow icon="users" title="People" subtitle="Friends you split costs with or lend to" showChevron onPress={() => router.push('/people')} />
          <ListRow icon="bell" title="Notifications" subtitle="Bill reminders, no amounts on the lock screen" showChevron onPress={() => router.push('/notifications')} />
          <ListRow icon="shield" title="App lock" subtitle="Protect Nomi with your phone's unlock" showChevron onPress={() => router.push('/privacy')} />
          <ListRow icon="shield" title="Privacy and data" subtitle="Export, retention and deletion" showChevron onPress={() => router.push('/privacy')} />
        </Surface>
      </View>

      {SHOW_DEV_TOOLS ? (
        <View style={{ gap: space.xs }}>
          <SectionHeader title="Developer" />
          <Surface padding="sm">
            <View style={{ padding: space.md, gap: space.sm }}>
              <Text variant="bodyStrong">Data</Text>
              <Text variant="caption" tone="muted">Demo shows example accounts and transactions, stored separately from real data. Empty shows a new user's first-run screens.</Text>
              <Segmented<DataMode> accessibilityLabel="Data" value={mode} onChange={setMode} options={[{ value: 'demo', label: 'Demo data' }, { value: 'real', label: 'Empty' }]} />
            </View>
            <ListRow icon="code" title="Component gallery" subtitle="Every component and UI state" showChevron onPress={() => router.push('/gallery')} />
          </Surface>
        </View>
      ) : null}
    </Screen>
  );
}
