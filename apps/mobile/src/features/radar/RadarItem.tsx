import { Pressable, View } from 'react-native';
import type { RadarSignal } from '@nomi/core';
import { MIN_TOUCH, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Icon, Surface, Text, type IconName } from '@/components/ui';

const ICON: Record<RadarSignal['kind'], IconName> = {
  bill_overdue: 'alert', bill_due_soon: 'bell', cash_short: 'alert', budget_over: 'alert', budget_at_risk: 'alert', spending_pace: 'insights', possible_duplicate: 'list', large_expense: 'insights',
};
const LABEL = { urgent: 'Needs attention', attention: 'Coming up', info: 'Worth a look' } as const;

/** One signal: what it is, why, a tap to go there, and a way to hide it. Urgent ones are marked in words as well as colour. */
export function RadarItem({ signal, onOpen, onDismiss }: { signal: RadarSignal; onOpen: () => void; onDismiss: () => void }) {
  const { colors } = useTheme();
  const urgent = signal.severity === 'urgent';
  return (
    <Surface variant={urgent ? 'peach' : 'raised'} padding="md" rounded="lg" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${LABEL[signal.severity]}. ${signal.title}. ${signal.detail}`} onPress={onOpen}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: space.md, minHeight: MIN_TOUCH, opacity: pressed ? 0.8 : 1 })}>
        <View style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: urgent ? colors.surface : colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={ICON[signal.kind]} size={18} color={urgent ? colors.caution : colors.onAccentSoft} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="caption" weight="bold" tone={urgent ? 'caution' : 'muted'}>{LABEL[signal.severity].toUpperCase()}</Text>
          <Text variant="bodyStrong">{signal.title}</Text>
          <Text variant="callout" tone="muted">{signal.detail}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss: ${signal.title}`} onPress={onDismiss} hitSlop={8}
        style={({ pressed }) => ({ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        <Icon name="close" size={18} color={colors.inkMuted} />
      </Pressable>
    </Surface>
  );
}
