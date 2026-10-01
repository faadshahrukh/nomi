import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { Analytics, type EventName } from '@nomi/core';
import { createHttpSink } from './httpSink';
import { config } from '@/config';
import { openRawRepository, userIdFor } from '@/data/repositories';

const KEY = 'analytics.enabled';

interface Value { available: boolean; enabled: boolean; setEnabled: (v: boolean) => Promise<void>; track: (name: EventName, props?: Record<string, unknown>) => void }
const Ctx = createContext<Value>({ available: false, enabled: false, setEnabled: async () => undefined, track: () => undefined });

/**
 * Anonymous usage counts, strictly opt-in and off by default. Available only when the build has an analytics endpoint; without one the
 * switch is not shown and nothing is ever recorded. The device setting is stored per device and never synced.
 */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const available = config.analyticsUrl.length > 0;
  const [enabled, setEnabledState] = useState(false);
  const on = useRef(false);
  const analytics = useMemo(() => new Analytics(available ? createHttpSink(config.analyticsUrl) : null, () => on.current), [available]);

  useEffect(() => {
    if (!available) return;
    openRawRepository('real').then((r) => r.getSetting(userIdFor('real'), KEY)).then((v) => { on.current = v === '1'; setEnabledState(on.current); if (on.current) analytics.track('app_opened'); }).catch(() => undefined);
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') void analytics.flush(); });
    return () => sub.remove();
  }, [available, analytics]);

  const setEnabled = useCallback(async (v: boolean) => {
    on.current = v; setEnabledState(v);
    if (!v) analytics.clear();
    await (await openRawRepository('real')).putSetting(userIdFor('real'), KEY, v ? '1' : '0');
  }, [analytics]);
  const track = useCallback((name: EventName, props?: Record<string, unknown>) => analytics.track(name, props), [analytics]);
  const value = useMemo(() => ({ available, enabled, setEnabled, track }), [available, enabled, setEnabled, track]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAnalytics = () => useContext(Ctx);
