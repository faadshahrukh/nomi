import type { VoiceFailure } from './voiceMachine';
import { mapSpeechError } from './voiceMachine';

/** Handlers for one recognition session. Only text ever crosses this boundary: audio is never stored or sent by Nomi. */
export interface SpeechHandlers {
  onStart: () => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (reason: VoiceFailure) => void;
}

export type PermissionOutcome = 'granted' | 'denied' | 'denied_permanently';

/** Port for speech to text. The sheet depends on this, so tests and builds without the native module use a stand-in. */
export interface SpeechService {
  available(): boolean;
  requestPermission(): Promise<PermissionOutcome>;
  start(lang: string, handlers: SpeechHandlers): () => void;
  stop(): void;
  abort(): void;
}

export const unavailableSpeech: SpeechService = {
  available: () => false, requestPermission: async () => 'denied', start: () => () => undefined, stop: () => undefined, abort: () => undefined,
};

/**
 * Platform recognition through expo-speech-recognition (native recognisers on iOS and Android, the browser's on web).
 * It is loaded lazily and guarded: Expo Go does not include the native module, and a missing module must lead to the
 * typed-input fallback rather than a crash.
 */
export function createSpeechService(): SpeechService {
  let mod: typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule | null = null;
  try { mod = require('expo-speech-recognition').ExpoSpeechRecognitionModule; } catch { mod = null; }
  if (!mod) return unavailableSpeech;
  const m = mod;
  let supported = false;
  try { supported = m.isRecognitionAvailable(); } catch { supported = false; }
  if (!supported) return unavailableSpeech;

  return {
    available: () => true,
    async requestPermission() {
      try {
        const r = await m.requestPermissionsAsync();
        return r.granted ? 'granted' : r.canAskAgain === false ? 'denied_permanently' : 'denied';
      } catch { return 'denied'; }
    },
    start(lang, h) {
      const subs = [
        m.addListener('start', () => h.onStart()),
        m.addListener('result', (e) => {
          const text = e.results?.[0]?.transcript ?? '';
          if (e.isFinal) h.onFinal(text); else h.onPartial(text);
        }),
        m.addListener('error', (e) => { const r = mapSpeechError(e.error); if (r) h.onError(r); }),
      ];
      try { m.start({ lang, interimResults: true, continuous: false, addsPunctuation: false }); } catch { h.onError('unknown'); }
      return () => subs.forEach((s) => s.remove());
    },
    stop: () => { try { m.stop(); } catch { /* already stopped */ } },
    abort: () => { try { m.abort(); } catch { /* already stopped */ } },
  };
}
