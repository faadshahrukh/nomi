import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { createSpeechService, type SpeechService } from './speech';
import { initialVoice, speechLanguage, voiceReducer } from './voiceMachine';

/** Drives one voice capture. Holds no financial logic: it produces text, and the normal capture pipeline takes it from there. */
export function useVoice(locale: 'en' | 'bn' | 'mixed', country: string, injected?: SpeechService) {
  const [state, dispatch] = useReducer(voiceReducer, initialVoice);
  const speech = useMemo(() => injected ?? createSpeechService(), [injected]);
  const stopListening = useRef<() => void>(() => undefined);
  const session = useRef(0);

  const cancel = useCallback(() => { session.current++; stopListening.current(); stopListening.current = () => undefined; speech.abort(); }, [speech]);

  const start = useCallback(async () => {
    cancel();
    const mine = session.current;
    dispatch({ type: 'open' });
    if (!speech.available()) { dispatch({ type: 'fail', reason: 'unavailable', canAskAgain: false }); return; }
    const permission = await speech.requestPermission();
    if (mine !== session.current) return;
    if (permission !== 'granted') { dispatch({ type: 'fail', reason: 'denied', canAskAgain: permission === 'denied' }); return; }
    const live = (fn: () => void) => { if (mine === session.current) fn(); };
    stopListening.current = speech.start(speechLanguage(locale, country), {
      onStart: () => live(() => dispatch({ type: 'listening' })),
      onPartial: (text) => live(() => dispatch({ type: 'partial', text })),
      onFinal: (text) => live(() => dispatch({ type: 'final', text })),
      onError: (reason) => live(() => dispatch({ type: 'fail', reason })),
    });
  }, [cancel, speech, locale, country]);

  const stop = useCallback(() => { dispatch({ type: 'stop' }); speech.stop(); }, [speech]);
  const close = useCallback(() => { cancel(); dispatch({ type: 'reset' }); }, [cancel]);
  useEffect(() => cancel, [cancel]);

  return { state, available: speech.available(), start, stop, close, edit: (text: string) => dispatch({ type: 'edit', text }) };
}
