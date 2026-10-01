import { useRef } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { MIN_TOUCH, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { fontFamily } from '@/design/tokens';
import { Button, Chip, Icon, IconButton, Surface, Text } from '@/components/ui';

/** Example phrases from the product spec. Tapping one fills the field so people learn the style by trying it. */
export const EXAMPLES = ['Spent ৳450 on lunch', 'Uber was ৳680', 'Paid ৳2,500 for electricity', 'I got my salary today, ৳120,000'];

export interface CaptureCardProps {
  /** The text box is controlled by the parent so a failed capture never loses what the user typed. */
  value: string;
  onChange: (text: string) => void;
  /** Called with trimmed text when the user submits. */
  onSubmitText: (text: string) => void;
  onMic: () => void;
  onManual?: () => void;
  disabled?: boolean;
  /** Replaces the supporting line, e.g. when capture cannot work yet. */
  hint?: string;
}

/**
 * The Home hero. Text and voice are equal: the microphone is the largest control on the screen.
 * Layout only; it holds no financial logic.
 */
export function CaptureCard({ value: text, onChange: setText, onSubmitText, onMic, onManual, disabled, hint }: CaptureCardProps) {
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  const canSend = text.trim().length > 0 && !disabled;

  const submit = () => { if (canSend) onSubmitText(text.trim()); };

  return (
    <Surface variant="raised" padding="xl" rounded="lg" style={{ gap: space.lg }}>
      <View style={{ gap: space.xs }}>
        <Text variant="title" accessibilityRole="header">What happened with your money?</Text>
        <Text variant="callout" tone="muted">{hint ?? 'Type or speak naturally.'}</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Speak a transaction" accessibilityHint="Starts voice capture" onPress={onMic} disabled={disabled}
          style={({ pressed }) => ({ width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}>
          <Icon name="mic" size={32} color={colors.onAccent} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, minHeight: 72, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSunken, borderRadius: radius.lg, paddingLeft: space.lg, paddingRight: space.xs }}>
          <TextInput
            ref={input} value={text} onChangeText={setText} onSubmitEditing={submit} editable={!disabled}
            placeholder="Spent ৳450 on lunch" placeholderTextColor={colors.inkMuted}
            accessibilityLabel="Describe what happened with your money" returnKeyType="send" multiline={false}
            style={{ flex: 1, minWidth: 0, minHeight: MIN_TOUCH, color: colors.ink, fontFamily: fontFamily.medium, fontSize: 16 }}
          />
          <IconButton icon="send" label="Send" variant={canSend ? 'accent' : 'plain'} disabled={!canSend} onPress={submit} />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} accessibilityLabel="Example phrases">
        {EXAMPLES.map((e) => <Chip key={e} label={e} onPress={() => { setText(e); input.current?.focus(); }} />)}
      </ScrollView>
      {onManual ? <View style={{ alignSelf: 'flex-start' }}><Button label="Enter details yourself" variant="ghost" icon="plus" disabled={disabled} onPress={onManual} /></View> : null}
    </Surface>
  );
}
