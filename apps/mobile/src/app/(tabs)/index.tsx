import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@/design/tokens';
import { appNow } from '@/data/clock';
import { useLedger } from '@/data/LedgerProvider';
import { CaptureCard } from '@/features/home/CaptureCard';
import { DemoBanner } from '@/features/home/DemoBanner';
import { HomeHeader } from '@/features/home/HomeHeader';
import { HomeSkeleton } from '@/features/home/HomeSkeleton';
import { MoneyPulseCard } from '@/features/home/MoneyPulseCard';
import { RecentActivity } from '@/features/home/RecentActivity';
import { SafeToSpendCard } from '@/features/home/SafeToSpendCard';
import { UpcomingCard } from '@/features/home/UpcomingCard';
import { WhatChangedCard } from '@/features/home/WhatChangedCard';
import { EmptyState, ErrorState, Screen, SectionHeader, Surface, useToast } from '@/components/ui';

function Section({ title, actionLabel, onAction, children }: { title: string; actionLabel?: string; onAction?: () => void; children: React.ReactNode }) {
  return <View style={{ gap: space.xs }}><SectionHeader title={title} actionLabel={actionLabel} onAction={onAction} />{children}</View>;
}

/** Home, in the order the spec requires. All figures arrive pre-computed from the core's HomeSummary. */
export default function HomeScreen() {
  const toast = useToast();
  const router = useRouter();
  const { state, mode, retry } = useLedger();
  const notConnected = () => toast.show({ message: "Capture isn't connected yet. It arrives in the next milestone.", tone: 'info' });

  return (
    <Screen>
      <HomeHeader now={appNow()} onNotifications={() => router.push('/more')} onProfile={() => router.push('/more')} />
      {mode === 'demo' && state.status === 'ready' ? <DemoBanner /> : null}
      <CaptureCard onSubmitText={notConnected} onMic={notConnected} />

      {state.status === 'loading' ? <HomeSkeleton /> : null}
      {state.status === 'error' ? <ErrorState title="Couldn't load your money" message="Your data is safe on this device. Try again." onRetry={retry} /> : null}

      {state.status === 'ready' && !state.summary.hasAccounts ? (
        <Surface padding="xl">
          <EmptyState icon="wallet" title="Add your first account" message="A cash wallet, bank account or bKash is enough to start. Then your balance, Safe to Spend and insights appear here."
            actionLabel="Add an account" onAction={() => toast.show({ message: "Accounts aren't built yet. They arrive with onboarding.", tone: 'info' })} />
        </Surface>
      ) : null}

      {state.status === 'ready' && state.summary.hasAccounts ? (
        <View style={{ gap: space.xl }}>
          <Section title="Money Pulse"><MoneyPulseCard summary={state.summary} /></Section>
          <Section title="Safe to Spend"><SafeToSpendCard summary={state.summary} /></Section>
          <Section title="What changed"><WhatChangedCard summary={state.summary} categories={state.snapshot.categories} /></Section>
          <Section title="Upcoming"><UpcomingCard summary={state.summary} /></Section>
          <Section title="Recent activity" actionLabel="See all" onAction={() => router.push('/transactions')}><RecentActivity summary={state.summary} /></Section>
        </View>
      ) : null}
    </Screen>
  );
}
