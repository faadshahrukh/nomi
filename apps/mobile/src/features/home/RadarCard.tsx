import { View } from 'react-native';
import type { RadarSignal } from '@nomi/core';
import { space } from '@/design/tokens';
import { Button } from '@/components/ui';
import { RadarItem } from '@/features/radar/RadarItem';

/** How many signals Home shows. The rest are one tap away, so Home stays calm. Absent entirely when there is nothing to say. */
export const HOME_RADAR = 2;

export function RadarCard({ signals, onOpen, onDismiss, onSeeAll }: { signals: RadarSignal[]; onOpen: (s: RadarSignal) => void; onDismiss: (s: RadarSignal) => void; onSeeAll: () => void }) {
  if (!signals.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      {signals.slice(0, HOME_RADAR).map((s) => <RadarItem key={s.key} signal={s} onOpen={() => onOpen(s)} onDismiss={() => onDismiss(s)} />)}
      {signals.length > HOME_RADAR ? <Button label={`See all ${signals.length} to look at`} variant="ghost" onPress={onSeeAll} /> : null}
    </View>
  );
}
