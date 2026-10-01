import { View } from 'react-native';
import { space } from '@/design/tokens';
import { Skeleton, Surface } from '@/components/ui';

/** Same shape as the loaded Home so nothing jumps when data arrives. */
export function HomeSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading your money" style={{ gap: space.xl }}>
      <Surface padding="xl" rounded="lg" style={{ gap: space.lg }}><Skeleton width="40%" height={12} /><Skeleton width="70%" height={44} /><Skeleton height={36} /></Surface>
      <Surface padding="xl" style={{ gap: space.md }}><Skeleton width="45%" height={12} /><Skeleton width="60%" height={44} /><Skeleton height={14} /></Surface>
      <Surface style={{ gap: space.md }}><Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} /></Surface>
    </View>
  );
}
