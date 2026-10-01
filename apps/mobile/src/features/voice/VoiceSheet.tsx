import { TextInput, View } from 'react-native';
import { fontFamily, radius, space } from '@/design/tokens';
import { useTheme } from '@/design/theme';
import { BottomSheet, Button, Icon, Text } from '@/components/ui';
import { Waveform } from './Waveform';
import { VOICE_FAILURE_COPY, type VoiceState } from './voiceMachine';

export interface VoiceSheetProps {
  visible: boolean; state: VoiceState;
  onStop: () => void; onRetry: () => void; onClose: () => void;
  onEdit: (text: string) => void;
  /** Hands the (possibly edited) text to normal capture. Nothing is saved by voice itself. */
  onUse: (text: string) => void;
}

const TITLE: Record<VoiceState['phase'], string> = { idle: 'Speak', requesting: 'Getting ready', listening: 'Listening', finishing: 'Finishing up', heard: 'Here is what I heard', failed: 'Voice capture' };

/** Every voice state in one sheet: asking, listening, finishing, edit-the-transcript, and each failure with a typed way forward. */
export function VoiceSheet({ visible, state, onStop, onRetry, onClose, onEdit, onUse }: VoiceSheetProps) {
  const { colors } = useTheme();
  const box = { minHeight: 64, borderRadius: radius.lg, backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.border, color: colors.ink, padding: space.lg, fontFamily: fontFamily.medium, fontSize: 17, textAlignVertical: 'top' } as const;
  return (
    <BottomSheet visible={visible} onClose={onClose} title={TITLE[state.phase]}>
      <View accessibilityLiveRegion="polite" style={{ gap: space.lg }}>
        {state.phase === 'requesting' ? <Text variant="callout" tone="muted">Asking for the microphone…</Text> : null}

        {state.phase === 'listening' || state.phase === 'finishing' ? (
          <View style={{ gap: space.lg }}>
            <Waveform active={state.phase === 'listening'} />
            <Text variant="body" align="center" tone={state.partial ? 'ink' : 'muted'} style={{ minHeight: 52 }}>
              {state.partial || (state.phase === 'listening' ? 'Say what happened, like "lunch 250 bKash".' : 'Just a moment…')}
            </Text>
            {state.phase === 'listening' ? <Button label="Stop" icon="close" size="lg" fullWidth onPress={onStop} /> : null}
          </View>
        ) : null}

        {state.phase === 'heard' ? (
          <View style={{ gap: space.md }}>
            <Text variant="callout" tone="muted">Fix anything that was misheard, especially amounts. You'll still confirm before anything is saved.</Text>
            <TextInput accessibilityLabel="What you said" value={state.transcript} onChangeText={onEdit} multiline style={box} />
            <Button label="Use this" size="lg" fullWidth disabled={!state.transcript.trim()} onPress={() => onUse(state.transcript.trim())} />
            <Button label="Speak again" variant="secondary" fullWidth onPress={onRetry} />
          </View>
        ) : null}

        {state.phase === 'failed' ? (
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', backgroundColor: colors.surfaceSunken, borderRadius: radius.lg, padding: space.lg }}>
              <Icon name="mic" size={22} color={colors.inkMuted} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong" accessibilityRole="alert">{VOICE_FAILURE_COPY[state.reason].title}</Text>
                <Text variant="callout" tone="muted">{VOICE_FAILURE_COPY[state.reason].body}</Text>
              </View>
            </View>
            <View style={{ gap: space.xs }}>
              <Text variant="callout" weight="semibold">{state.transcript ? 'What I heard (edit it, or type your own)' : 'Type it instead'}</Text>
              <TextInput accessibilityLabel="Type what happened" value={state.transcript} onChangeText={onEdit} placeholder="I spent 850 on dinner" placeholderTextColor={colors.inkMuted} style={box} />
            </View>
            <Button label="Use this" size="lg" fullWidth disabled={!state.transcript.trim()} onPress={() => onUse(state.transcript.trim())} />
            {state.canAskAgain && state.reason !== 'unavailable' ? <Button label="Try again" variant="secondary" fullWidth onPress={onRetry} /> : null}
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}
