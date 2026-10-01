import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@/design/tokens';
import { useLedger } from '@/data/LedgerProvider';
import { WhatChangedCard } from '@/features/home/WhatChangedCard';
import { ErrorState, Screen, ScreenTitle, SectionHeader, SkeletonLines } from '@/components/ui';

/** Only "What changed" exists so far. Patterns, categories, merchants and reports arrive in later milestones. */
export default function Insights() {
  const router = useRouter();
  const { state, retry } = useLedger();
  return (
    <Screen>
      <ScreenTitle title="Insights" subtitle="What your money is doing" />
      {state.status === 'loading' ? <SkeletonLines lines={5} /> : null}
      {state.status === 'error' ? <ErrorState onRetry={retry} title="Couldn't load insights" /> : null}
      {state.status === 'ready' ? (
        <View style={{ gap: space.xs }}>
          <SectionHeader title="What changed" />
          <WhatChangedCard summary={state.summary} categories={state.snapshot.categories} onDriver={(id) => router.push(`/transactions?categoryId=${id}&period=this_month`)} />
        </View>
      ) : null}
    </Screen>
  );
}
