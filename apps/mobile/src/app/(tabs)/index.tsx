import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@/design/tokens';
import { appNow } from '@/data/clock';
import { useLedger } from '@/data/LedgerProvider';
import { AddAccountSheet } from '@/features/accounts/AddAccountSheet';
import { CaptureFlow } from '@/features/capture/CaptureFlow';
import { HomeHeader } from '@/features/home/HomeHeader';
import { HomeSkeleton } from '@/features/home/HomeSkeleton';
import { MoneyPulseCard } from '@/features/home/MoneyPulseCard';
import { RecentActivity } from '@/features/home/RecentActivity';
import { SafeToSpendCard } from '@/features/home/SafeToSpendCard';
import { SectionTitle } from '@/features/home/SectionTitle';
import { SignalCard } from '@/features/home/SignalCard';
import { UpcomingCard } from '@/features/home/UpcomingCard';
import { EmptyState, ErrorState, Screen, Surface, useToast } from '@/components/ui';

/**
 * Home, in the order the spec requires: header, capture, then the picture of your money (balance, what is safe to spend,
 * one signal if there is one), then what is coming and what just happened. Kept short on purpose; everything else is a tap away.
 * All figures arrive pre-computed from the core's HomeSummary.
 */
export default function HomeScreen() {
  const toast = useToast();
  const router = useRouter();
  const { state, mode, retry } = useLedger();
  const [addingAccount, setAddingAccount] = useState(false);
  const ready = state.status === 'ready' ? state : null;

  return (
    <Screen>
      <HomeHeader now={appNow()} today={ready?.summary.today ?? ''} name={ready?.snapshot.profile.displayName ?? null} demo={mode === 'demo' && !!ready}
        onNotifications={() => toast.show({ message: 'Notifications arrive in a later milestone.', tone: 'info' })} onProfile={() => router.push('/profile')} />
      <CaptureFlow />

      {state.status === 'loading' ? <HomeSkeleton /> : null}
      {state.status === 'error' ? <ErrorState title="Couldn't load your money" message="Your data is safe on this device. Try again." onRetry={retry} /> : null}

      {ready && !ready.summary.hasAccounts ? (
        <Surface padding="xl" rounded="xl">
          <EmptyState icon="wallet" title="Add your first account" message="A cash wallet, bank account or bKash is enough to start. Then your balance, Safe to Spend and insights appear here."
            actionLabel="Add an account" onAction={() => setAddingAccount(true)} />
        </Surface>
      ) : null}

      {ready && ready.summary.hasAccounts ? (
        <View style={{ gap: space.xl }}>
          <View style={{ gap: space.lg }}>
            <MoneyPulseCard summary={ready.summary} onDetails={() => router.push('/money-pulse')} />
            <SafeToSpendCard summary={ready.summary} onDetails={() => router.push('/safe-to-spend')} />
            <SignalCard summary={ready.summary} categories={ready.snapshot.categories} onDetails={() => router.push('/insights')} />
          </View>
          <View style={{ gap: space.sm }}>
            <SectionTitle icon="planning" title="Upcoming" onAction={() => router.push('/planning')} />
            <UpcomingCard summary={ready.summary} accounts={ready.snapshot.accounts} />
          </View>
          <View style={{ gap: space.sm }}>
            <SectionTitle icon="clock" title="Recent Activity" onAction={() => router.push('/transactions')} />
            <RecentActivity summary={ready.summary} />
          </View>
        </View>
      ) : null}
      {ready ? <AddAccountSheet visible={addingAccount} currency={ready.snapshot.profile.currency} onClose={() => setAddingAccount(false)} /> : null}
    </Screen>
  );
}
