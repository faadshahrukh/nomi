import { View } from 'react-native';
import { formatMoney, roundToWhole } from '@nomi/core';
import { space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Badge, Button, Icon, Skeleton, SkeletonLines, Surface, Text } from '@/components/ui';
import type { CaptureState } from './captureReducer';

export function ProcessingCard({ text }: { text: string }) {
  return (
    <Surface padding="xl" rounded="lg" style={{ gap: space.md }} aria-live="polite" accessibilityLabel="Understanding what you said">
      <Text variant="heading">Understanding…</Text>
      <Text variant="callout" tone="muted" numberOfLines={2}>{text}</Text>
      <SkeletonLines lines={2} />
      <Skeleton height={44} />
    </Surface>
  );
}

const MESSAGES = {
  unavailable: { title: "Couldn't process that right now", message: 'Nothing was saved. You can try again, or enter the details yourself.' },
  invalid_output: { title: "I couldn't read that", message: 'Nothing was saved. You can try again, or enter the details yourself.' },
  not_a_transaction: { title: "I couldn't find a transaction in that", message: 'Try something like “Spent 450 on lunch” or “Moved 5,000 from bank to bKash”. Or enter the details yourself.' },
} as const;

export function FailedCard({ reason, onRetry, onManual, onDismiss }: { reason: keyof typeof MESSAGES; onRetry: () => void; onManual: () => void; onDismiss: () => void }) {
  const { colors } = useTheme();
  return (
    <Surface padding="xl" rounded="lg" style={{ gap: space.md }} accessibilityRole="alert">
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Icon name="alert" size={20} color={colors.caution} />
        <Text variant="heading" style={{ flex: 1 }}>{MESSAGES[reason].title}</Text>
      </View>
      <Text variant="callout" tone="muted">{MESSAGES[reason].message} Your message is still in the box above.</Text>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        {reason !== 'not_a_transaction' ? <Button label="Try again" icon="refresh" variant="secondary" onPress={onRetry} /> : null}
        <Button label="Enter details" icon="plus" onPress={onManual} />
        <Button label="Dismiss" variant="ghost" onPress={onDismiss} />
      </View>
    </Surface>
  );
}

/** Confirmation plus what it did to the user's picture: Safe to Spend before and after. */
export function SavedCard({ saved, onUndo, onDone }: { saved: Extract<CaptureState, { phase: 'saved' }>; onUndo: () => void; onDone: () => void }) {
  const delta = saved.safeAfter - saved.safeBefore;
  const c = saved.currency;
  const whole = (n: number) => formatMoney(roundToWhole(Math.abs(n), c), c);
  return (
    <Surface variant="accent" padding="xl" rounded="lg" style={{ gap: space.md }} aria-live="polite">
      <Badge label="Saved" tone="positive" icon="check" />
      <View style={{ gap: space.xs }}>
        {saved.entries.map((e) => <Text key={e.id} variant="heading" numeric>{e.label} · {formatMoney(e.amountMinor, c)}</Text>)}
      </View>
      <Text variant="callout">
        {delta === 0 ? `Safe to Spend is unchanged at ${whole(saved.safeAfter)}.`
          : `Safe to Spend is now ${whole(saved.safeAfter)}, ${delta < 0 ? 'down' : 'up'} ${whole(delta)}.`}
      </Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button label="Undo" variant="secondary" onPress={onUndo} />
        <Button label="Done" variant="ghost" onPress={onDone} />
      </View>
    </Surface>
  );
}
