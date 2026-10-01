/** Why a voice capture did not produce usable text. Each has its own message and its own way forward. */
export type VoiceFailure = 'denied' | 'unavailable' | 'no_speech' | 'network' | 'language' | 'interrupted' | 'unknown';

export type VoiceState =
  | { phase: 'idle' }
  | { phase: 'requesting' }
  | { phase: 'listening'; partial: string }
  /** Stop was pressed; waiting for the recogniser's final text. */
  | { phase: 'finishing'; partial: string }
  /** Text is ready. The user can edit it before it is understood. Nothing is saved from here. */
  | { phase: 'heard'; transcript: string }
  /** Whatever was heard before the failure is kept so it can be edited rather than re-spoken. */
  | { phase: 'failed'; reason: VoiceFailure; transcript: string; canAskAgain: boolean };

export type VoiceAction =
  | { type: 'open' }
  | { type: 'listening' }
  | { type: 'partial'; text: string }
  | { type: 'stop' }
  | { type: 'final'; text: string }
  | { type: 'edit'; text: string }
  | { type: 'fail'; reason: VoiceFailure; canAskAgain?: boolean }
  | { type: 'reset' };

export const initialVoice: VoiceState = { phase: 'idle' };

const heardSoFar = (s: VoiceState): string => (s.phase === 'listening' || s.phase === 'finishing' ? s.partial : s.phase === 'heard' || s.phase === 'failed' ? s.transcript : '');

/** Pure transitions. Anything asynchronous (permissions, the recogniser) lives in useVoice; this only decides what the sheet shows. */
export function voiceReducer(state: VoiceState, a: VoiceAction): VoiceState {
  switch (a.type) {
    case 'reset': return initialVoice;
    case 'open': return { phase: 'requesting' };
    case 'listening': return state.phase === 'requesting' ? { phase: 'listening', partial: '' } : state;
    case 'partial': return state.phase === 'listening' || state.phase === 'finishing' ? { ...state, partial: a.text } : state;
    case 'stop': return state.phase === 'listening' ? { phase: 'finishing', partial: state.partial } : state;
    case 'final': {
      if (state.phase !== 'listening' && state.phase !== 'finishing') return state;
      const text = a.text.trim();
      return text ? { phase: 'heard', transcript: text } : { phase: 'failed', reason: 'no_speech', transcript: '', canAskAgain: true };
    }
    case 'edit': return state.phase === 'heard' || state.phase === 'failed' ? (state.phase === 'heard' ? { phase: 'heard', transcript: a.text } : { ...state, transcript: a.text }) : state;
    case 'fail': return { phase: 'failed', reason: a.reason, transcript: heardSoFar(state).trim(), canAskAgain: a.canAskAgain ?? true };
  }
}

/** Maps a recogniser error code to a failure. null means the user cancelled, which is not an error. */
export function mapSpeechError(code: string): VoiceFailure | null {
  switch (code) {
    case 'aborted': return null;
    case 'not-allowed': case 'service-not-allowed': return 'denied';
    case 'no-speech': case 'speech-timeout': case 'nomatch': return 'no_speech';
    case 'network': return 'network';
    case 'language-not-supported': return 'language';
    case 'interrupted': case 'audio-capture': case 'busy': return 'interrupted';
    default: return 'unknown';
  }
}

export const VOICE_FAILURE_COPY: Record<VoiceFailure, { title: string; body: string }> = {
  denied: { title: 'Microphone access is off', body: 'Allow the microphone and speech recognition for Nomi in your phone settings, or type instead.' },
  unavailable: { title: "Voice isn't available here", body: "This phone or build can't recognise speech right now. Type it instead; it works the same." },
  no_speech: { title: "I didn't catch that", body: 'Try again and speak a little closer, or type it instead.' },
  network: { title: "Couldn't reach the speech service", body: 'Check your connection and try again, or type it instead.' },
  language: { title: "This language isn't installed for speech", body: 'Add it in your phone’s speech settings, or type it instead.' },
  interrupted: { title: 'Listening was interrupted', body: 'Something else used the microphone. Try again, or type it instead.' },
  unknown: { title: 'Something went wrong with voice', body: 'Try again, or type it instead.' },
};

/** The language to listen for. Bangladesh users mix Bangla and English, and the Bangla recogniser copes with both. */
export function speechLanguage(locale: 'en' | 'bn' | 'mixed', country: string): string {
  if (locale === 'bn' || locale === 'mixed') return 'bn-BD';
  return ({ IN: 'en-IN', GB: 'en-GB', US: 'en-US' } as Record<string, string>)[country] ?? 'en-US';
}
