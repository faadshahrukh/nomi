import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { useTheme } from '@/design/theme';

const HEIGHTS = [14, 28, 40, 24, 48, 30, 18, 38, 26, 44, 20, 32, 16];

/** A decorative "I'm listening" indicator. Still when the user prefers reduced motion; hidden from screen readers. */
export function Waveform({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const [reduce, setReduce] = useState(false);
  const bars = useRef(HEIGHTS.map(() => new Animated.Value(0.35))).current;
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => undefined); }, []);
  useEffect(() => {
    if (!active || reduce) { bars.forEach((b) => b.setValue(0.5)); return; }
    const loops = bars.map((b, i) => Animated.loop(Animated.sequence([
      Animated.timing(b, { toValue: 1, duration: 420 + (i % 4) * 110, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.timing(b, { toValue: 0.3, duration: 420 + (i % 3) * 130, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, reduce, bars]);
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 56 }}>
      {bars.map((b, i) => <Animated.View key={i} style={{ width: 5, borderRadius: 3, backgroundColor: colors.accent, height: b.interpolate({ inputRange: [0, 1], outputRange: [4, HEIGHTS[i]!] }) }} />)}
    </View>
  );
}
