import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { canProtect, parseGrace, shouldLock, type AppLockSettings, type LockGraceSeconds } from '@nomi/core';
import { useTheme } from '@/design/theme';
import { openRawRepository, userIdFor } from '@/data/repositories';
import { Button, Icon, Text } from '@/components/ui';
import { createAuthenticator, type Authenticator } from './authenticator';

interface Value {
  /** The phone can ask for fingerprint, face or PIN. False on web and on phones with no screen lock set. */
  available: boolean;
  settings: AppLockSettings;
  /** Turning on asks for the phone's unlock once first, to prove it works and avoid locking yourself out. */
  setEnabled: (on: boolean) => Promise<'ok' | 'failed' | 'unavailable'>;
  setGrace: (s: LockGraceSeconds) => Promise<void>;
}
const Ctx = createContext<Value>({ available: false, settings: { enabled: false, graceSeconds: 30 }, setEnabled: async () => 'unavailable', setGrace: async () => undefined });
export const useAppLock = () => useContext(Ctx);

const K_ON = 'applock.enabled', K_GRACE = 'applock.grace';

/**
 * Locks Nomi behind the phone's own unlock. The app's screens stay mounted underneath (so you return to exactly where you were) but
 * are hidden and unreachable, including to screen readers, until unlock succeeds. When the app goes to the app switcher it is covered
 * as well, so balances do not show in the thumbnail. If the phone has no screen lock at all, Nomi cannot protect itself and lets you in.
 */
export function AppLockProvider({ children, injected }: { children: ReactNode; injected?: Authenticator }) {
  const { colors } = useTheme();
  const auth = useMemo(() => injected ?? createAuthenticator(), [injected]);
  const [settings, setSettings] = useState<AppLockSettings>({ enabled: false, graceSeconds: 30 });
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    (async () => {
      const repo = await openRawRepository('real'), uid = userIdFor('real');
      const [on, grace, cap] = await Promise.all([repo.getSetting(uid, K_ON), repo.getSetting(uid, K_GRACE), auth.capability()]);
      const s = { enabled: on === '1' && auth.supported(), graceSeconds: parseGrace(grace) };
      setSettings(s); setAvailable(auth.supported() && canProtect(cap)); setLocked(shouldLock({ settings: s, backgroundedAtMs: null, nowMs: Date.now() })); setLoaded(true);
    })().catch(() => setLoaded(true));
  }, [auth]);

  const unlock = useCallback(async () => {
    setMessage(null);
    const cap = await auth.capability();
    if (!canProtect(cap)) { setLocked(false); setMessage('This phone has no screen lock set, so Nomi cannot protect itself. Set one in your phone settings.'); return; }
    const r = await auth.authenticate('Unlock Nomi');
    if (r === 'success') setLocked(false);
    else if (r === 'unavailable') { setLocked(false); setMessage("The phone's unlock isn't available right now, so Nomi opened without it."); }
    else setMessage(r === 'cancelled' ? 'Nomi is locked.' : "That didn't work. Try again.");
  }, [auth]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        setCovered(false);
        if (shouldLock({ settings: settingsRef.current, backgroundedAtMs: backgroundedAt.current, nowMs: Date.now() })) setLocked(true);
        backgroundedAt.current = null;
      } else {
        if (backgroundedAt.current === null) backgroundedAt.current = Date.now();
        if (settingsRef.current.enabled) setCovered(true);
      }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => { if (loaded && locked) void unlock(); }, [loaded, locked, unlock]);

  const setEnabled = useCallback<Value['setEnabled']>(async (on) => {
    if (on) {
      if (!available) return 'unavailable';
      if ((await auth.authenticate('Turn on app lock')) !== 'success') return 'failed';
    }
    const repo = await openRawRepository('real');
    await repo.putSetting(userIdFor('real'), K_ON, on ? '1' : '0');
    setSettings((s) => ({ ...s, enabled: on }));
    return 'ok';
  }, [available, auth]);
  const setGrace = useCallback(async (g: LockGraceSeconds) => {
    await (await openRawRepository('real')).putSetting(userIdFor('real'), K_GRACE, String(g));
    setSettings((s) => ({ ...s, graceSeconds: g }));
  }, []);

  const value = useMemo(() => ({ available, settings, setEnabled, setGrace }), [available, settings, setEnabled, setGrace]);
  const loading = auth.supported() && !loaded; // until the setting is known, show nothing rather than flash the app
  const hidden = loading || (settings.enabled && (locked || covered));
  return (
    <Ctx.Provider value={value}>
      <View style={{ flex: 1 }} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'} pointerEvents={hidden ? 'none' : 'auto'}>{children}</View>
      {loading ? <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.bg }} /> : null}
      {settings.enabled && (locked || covered) ? (
        <View accessibilityViewIsModal style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
          <Icon name="shield" size={40} color={colors.accent} />
          <Text variant="title" accessibilityRole="header">Nomi is locked</Text>
          {message ? <Text variant="callout" tone="muted" align="center" accessibilityRole="alert">{message}</Text> : null}
          {locked ? <Button label="Unlock" size="lg" onPress={() => void unlock()} /> : null}
        </View>
      ) : null}
    </Ctx.Provider>
  );
}
