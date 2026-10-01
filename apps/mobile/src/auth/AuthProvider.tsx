import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { config } from '@/config';
import { createAuthService } from './createAuthService';
import type { AuthService, AuthSession } from './types';

interface AuthValue {
  service: AuthService;
  /** loading: restoring a saved session. signedOut / signedIn once known. */
  status: 'loading' | 'signedOut' | 'signedIn';
  session: AuthSession | null;
  /** False when the build has no backend settings. The app then runs fully on-device. */
  configured: boolean;
  /** Always the freshest token (the service refreshes it), or null when signed out. */
  getToken: () => Promise<string | null>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children, service: injected }: { children: ReactNode; service?: AuthService }) {
  const service = useMemo(() => injected ?? createAuthService(), [injected]);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthValue['status']>('loading');

  useEffect(() => {
    let alive = true;
    service.getSession().then((s) => { if (alive) { setSession(s); setStatus(s ? 'signedIn' : 'signedOut'); } }).catch(() => { if (alive) setStatus('signedOut'); });
    const off = service.onChange((s) => { setSession(s); setStatus(s ? 'signedIn' : 'signedOut'); });
    return () => { alive = false; off(); };
  }, [service]);

  const value = useMemo<AuthValue>(() => ({
    service, status, session, configured: injected ? true : config.backendConfigured,
    getToken: async () => (await service.getSession().catch(() => null))?.accessToken ?? null,
  }), [service, status, session, injected]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
