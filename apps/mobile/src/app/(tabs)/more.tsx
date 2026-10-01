import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@/design/tokens';
import { useTheme, type SchemePreference } from '@/design/theme';
import { useAuth } from '@/auth/AuthProvider';
import { config } from '@/config';
import { useLedger } from '@/data/LedgerProvider';
import type { DataMode } from '@/data/repositories';
import { ListRow, Screen, ScreenTitle, SectionHeader, Segmented, Surface, Text, useToast } from '@/components/ui';

export const SHOW_DEV_TOOLS = __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === '1';

export default function More() {
  const { preference, setPreference } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const { mode, setMode, state, updateProfile } = useLedger();
  const auth = useAuth();
  const aiOn = state.status === 'ready' ? state.snapshot.profile.aiProcessing : true;
  const aiStatus = !config.backendConfigured ? "AI understanding isn't set up in this build, so messages are understood on this device."
    : !aiOn ? 'Messages are understood on this device only and never leave it.'
    : auth.status === 'signedIn' ? 'Your message is sent securely to an AI service to be understood. Only the sentence and the names of your accounts, categories and people are sent. Balances and history never are.'
    : 'AI understanding starts when you sign in. Until then messages stay on this device.';
  const later = (what: string) => () => toast.show({ message: `${what} isn't built yet.`, tone: 'info' });
  return (
    <Screen>
      <ScreenTitle title="More" subtitle="Settings and tools" />

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
        <SectionHeader title="Settings" />
        <Surface padding="sm">
          <ListRow icon="wallet" title="Accounts" subtitle="Cash, bank, cards, mobile wallets" showChevron onPress={later('Accounts')} />
          <ListRow icon="tag" title="Categories" subtitle="Edit how spending is grouped" showChevron onPress={later('Categories')} />
          <ListRow icon="bell" title="Notifications" subtitle="Only what is worth your attention" showChevron onPress={later('Notifications')} />
          <ListRow icon="shield" title="App lock and data retention" subtitle="Coming soon" showChevron onPress={later('App lock')} />
          <ListRow icon="download" title="Export and delete" subtitle="Download or erase your data" showChevron onPress={later('Export')} />
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
