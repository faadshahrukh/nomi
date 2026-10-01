import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@/design/tokens';
import { CaptureCard } from '@/features/home/CaptureCard';
import { HomeHeader } from '@/features/home/HomeHeader';
import { EmptyState, Screen, SectionHeader, Surface, useToast } from '@/components/ui';

/** Home, in the order the spec requires. Sections other than capture show first-run empty states until the data layer is connected. */
const SECTIONS = [
  { title: 'Money Pulse', empty: { title: 'Your balance will appear here', message: 'Add an account to see your balance, spending and income this month.' } },
  { title: 'Safe to Spend', empty: { title: 'Not enough to estimate yet', message: 'It needs an account balance and a month to look ahead.' } },
  { title: 'Financial Radar', empty: { title: 'Nothing needs your attention', message: 'Important changes and risks will show up here.' } },
  { title: 'Upcoming', empty: { title: 'No bills or recurring payments', message: 'Add recurring expenses to see what is coming.' } },
  { title: 'Recent activity', empty: { title: 'No transactions yet', message: 'Tell Nomi what you spent and it will appear here.' } },
] as const;

export default function HomeScreen() {
  const toast = useToast();
  const router = useRouter();
  const notConnected = () => toast.show({ message: "Capture isn't connected yet. It arrives in the next milestone.", tone: 'info' });
  return (
    <Screen>
      <HomeHeader now={new Date()} onNotifications={() => router.push('/more')} onProfile={() => router.push('/more')} />
      <CaptureCard onSubmitText={notConnected} onMic={notConnected} />
      <View style={{ gap: space.xl }}>
        {SECTIONS.map((s) => (
          <View key={s.title} style={{ gap: space.xs }}>
            <SectionHeader title={s.title} />
            <Surface variant="raised"><EmptyState compact {...s.empty} /></Surface>
          </View>
        ))}
      </View>
    </Screen>
  );
}
