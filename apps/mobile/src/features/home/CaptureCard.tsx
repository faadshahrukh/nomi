import { useRef } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { MIN_TOUCH, fontFamily, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { Icon, Surface, Text, type IconName } from '@/components/ui';

/** Example phrases. Tapping one fills the box so people learn the style by trying it; none is sent until they press send. */
export const EXAMPLES: Array<{ text: string; icon: IconName }> = [
  { text: 'Spent 850 on dinner', icon: 'utensils' },
  { text: 'Paid electricity bill', icon: 'bolt' },
  { text: 'Lent Rahim 1,200', icon: 'users' },
];

export interface CaptureCardProps {
  /** The text box is controlled by the parent so a failed capture never loses what the user typed. */
  value: string;
  onChange: (text: string) => void;
  onSubmitText: (text: string) => void;
  onMic: () => void;
  onManual?: () => void;
  disabled?: boolean;
  /** Replaces the supporting line, e.g. when capture cannot work yet. */
  hint?: string;
}

/**
 * The Home hero. Text and voice are equal: the microphone sits inside the input as the strongest control on the screen.
 * Layout only; it holds no financial logic.
 */
export function CaptureCard({ value: text, onChange: setText, onSubmitText, onMic, onManual, disabled, hint }: CaptureCardProps) {
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  const canSend = text.trim().length > 0 && !disabled;
  const submit = () => { if (canSend) onSubmitText(text.trim()); };

  return (
    <Surface variant="mint" padding="xl" rounded="xl" style={{ gap: space.lg }}>
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name="sparkle" size={18} color={colors.accent} />
          <Text variant="overline" weight="bold" style={{ color: colors.accent }}>NOMI</Text>
        </View>
        <Text variant="title" weight="extrabold" accessibilityRole="header">What happened with your money?</Text>
        <Text variant="callout" tone="muted">{hint ?? 'Type or speak naturally.'}</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1, minWidth: 0, minHeight: 64, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingLeft: space.xl, paddingRight: space.xs }}>
          <TextInput
            ref={input} value={text} onChangeText={setText} onSubmitEditing={submit} editable={!disabled}
            placeholder="I spent 850 on dinner" placeholderTextColor={colors.inkMuted}
            accessibilityLabel="Describe what happened with your money" returnKeyType="send" multiline={false}
            style={{ flex: 1, minWidth: 0, minHeight: MIN_TOUCH, color: colors.ink, fontFamily: fontFamily.medium, fontSize: 16 }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Speak a transaction" accessibilityHint="Starts voice capture" onPress={onMic} disabled={disabled}
            style={({ pressed }) => ({ width: 54, height: 54, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.85 : 1 })}>
            <Icon name="mic" size={26} color={colors.onAccent} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Send" aria-disabled={!canSend} disabled={!canSend} onPress={submit}
          style={({ pressed }) => ({ width: 54, height: 54, borderRadius: radius.pill, borderWidth: 1, borderColor: canSend ? colors.accent : colors.border, backgroundColor: canSend ? colors.accent : colors.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
          <Icon name="paperPlane" size={22} color={canSend ? colors.onAccent : colors.inkMuted} />
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} accessibilityLabel="Example phrases">
        {EXAMPLES.map((e) => (
          <Pressable key={e.text} accessibilityRole="button" accessibilityLabel={e.text} onPress={() => { setText(e.text); input.current?.focus(); }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: MIN_TOUCH - 4, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.8 : 1 })}>
            <Icon name={e.icon} size={16} color={colors.accent} />
            <Text variant="callout" weight="medium">{e.text}</Text>
          </Pressable>
        ))}
        {onManual ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Enter details yourself" disabled={disabled} onPress={onManual}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: MIN_TOUCH - 4, paddingHorizontal: space.lg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 })}>
            <Icon name="plus" size={16} color={colors.accent} />
            <Text variant="callout" weight="semibold" tone="accent">Enter manually</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Surface>
  );
}
