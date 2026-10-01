import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@/design/tokens';
import { useTheme, type SchemePreference } from '@/design/theme';
import { ListRow, Screen, ScreenTitle, SectionHeader, Segmented, Surface, Text, useToast } from '@/components/ui';

export const SHOW_DEV_TOOLS = __DEV__ || process.env.EXPO_PUBLIC_DEV_TOOLS === '1';

export default function More() {
  const { preference, setPreference } = useTheme();
  const toast = useToast();
  const router = useRouter();
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
        <SectionHeader title="Settings" />
        <Surface padding="sm">
          <ListRow icon="wallet" title="Accounts" subtitle="Cash, bank, cards, mobile wallets" showChevron onPress={later('Accounts')} />
          <ListRow icon="tag" title="Categories" subtitle="Edit how spending is grouped" showChevron onPress={later('Categories')} />
          <ListRow icon="bell" title="Notifications" subtitle="Only what is worth your attention" showChevron onPress={later('Notifications')} />
          <ListRow icon="shield" title="Privacy" subtitle="AI processing, retention, app lock" showChevron onPress={later('Privacy')} />
          <ListRow icon="download" title="Export and delete" subtitle="Download or erase your data" showChevron onPress={later('Export')} />
        </Surface>
      </View>

      {SHOW_DEV_TOOLS ? (
        <View style={{ gap: space.xs }}>
          <SectionHeader title="Developer" />
          <Surface padding="sm">
            <ListRow icon="code" title="Component gallery" subtitle="Every component and UI state" showChevron onPress={() => router.push('/gallery')} />
          </Surface>
        </View>
      ) : null}
    </Screen>
  );
}
