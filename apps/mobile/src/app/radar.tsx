import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@/design/tokens';
import { useLedger } from '@/data/LedgerProvider';
import { RadarItem } from '@/features/radar/RadarItem';
import { openTarget } from '@/features/radar/openTarget';
import { Button, EmptyState, ErrorState, Screen, ScreenTitle, SkeletonLines, useToast } from '@/components/ui';

/** Everything that needs a look, most urgent first. Dismissing hides a signal for that month or item only. */
export default function RadarScreen() {
  const router = useRouter();
  const toast = useToast();
  const { state, retry, dismissSignal } = useLedger();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Screen>
      <Button label="Back" variant="ghost" icon="chevronLeft" onPress={back} />
      <ScreenTitle title="Financial Radar" subtitle="Things worth a look, worked out from your own records" />
      {state.status === 'loading' ? <SkeletonLines lines={4} /> : null}
      {state.status === 'error' ? <ErrorState onRetry={retry} title="Couldn't load this" /> : null}
      {state.status === 'ready' ? (state.radar.length
        ? <View style={{ gap: space.md }}>{state.radar.map((s) => (
            <RadarItem key={s.key} signal={s} onOpen={() => openTarget(router, s.target)}
              onDismiss={() => { dismissSignal(s.key).catch(() => toast.show({ message: "Couldn't dismiss that.", tone: 'error' })); }} />))}</View>
        : <EmptyState icon="shieldCheck" title="All clear" message="No overdue bills, budgets in trouble or unusual entries right now. Nomi will tell you if that changes." />) : null}
    </Screen>
  );
}
