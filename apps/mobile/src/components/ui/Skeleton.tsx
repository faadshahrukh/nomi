import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, View, type DimensionValue } from 'react-native';
import { radius } from '@/design/tokens';
import { useTheme } from '@/design/theme';

/** Placeholder block. Pulses gently, and holds still when the user prefers reduced motion. */
export function Skeleton({ width = '100%', height = 16, rounded = radius.sm }: { width?: DimensionValue; height?: number; rounded?: number }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => alive && setReduce(r)).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (reduce) { opacity.setValue(0.7); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.45, duration: 800, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduce, opacity]);

  return (
    <Animated.View style={{ width, height, borderRadius: rounded, backgroundColor: colors.surfaceSunken, opacity }}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
  );
}

/** Convenience: a stack of text-line skeletons. */
export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <View style={{ gap: 10 }} accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} />)}
    </View>
  );
}
