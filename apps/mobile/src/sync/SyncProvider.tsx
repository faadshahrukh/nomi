import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { draftFromTransaction, runSync, type SyncConflict, type SyncReport } from '@nomi/core';
import { config } from '@/config';
import { useAuth } from '@/auth/AuthProvider';
import { useLedger } from '@/data/LedgerProvider';
import { openRawRepository, userIdFor } from '@/data/repositories';
import { useOnline } from '@/providers/NetworkProvider';
import { appNow } from '@/data/clock';
import { createHttpRemote } from './httpRemote';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'failed' | 'offline' | 'wrong_account';

interface SyncValue {
  status: SyncStatus;
  /** Why sync is off, when it is: shown to the user in plain words. */
  offReason: 'not_configured' | 'signed_out' | 'demo' | null;
  lastSyncedAt: string | null;
  pending: number; rejected: number;
  conflicts: SyncConflict[];
  syncNow: () => Promise<void>;
  resolveConflict: (id: string, choice: 'keep_server' | 'use_mine') => Promise<{ ok: true } | { ok: false; message: string }>;
}

const Ctx = createContext<SyncValue | null>(null);
const DEBOUNCE_MS = 4000;

/**
 * Keeps this device and the user's account in step, quietly. It runs when signing in, when the phone comes back online or the app
 * returns to the front, and a few seconds after something is changed. It does nothing for example data, when signed out, or when the
 * build has no backend, and a failed run just waits for the next trigger: the queue is never lost.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const online = useOnline();
  const { state, mode, refresh, updateTransaction } = useLedger();
  const [status, setStatus] = useState<SyncStatus>('off');
  const [last, setLast] = useState<string | null>(null);
  const [counts, setCounts] = useState({ pending: 0, rejected: 0 });
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accountId = auth.session?.user.id ?? null;
  const offReason: SyncValue['offReason'] = mode === 'demo' ? 'demo' : !config.backendConfigured ? 'not_configured' : auth.status !== 'signedIn' || !accountId ? 'signed_out' : null;
  const ready = state.status === 'ready';

  const readLocal = useCallback(async () => {
    const repo = await openRawRepository(mode);
    const uid = userIdFor(mode);
    const [outbox, found, lastAt] = await Promise.all([repo.listOutbox(uid, 100000), repo.listConflicts(uid), repo.getSetting(uid, 'sync.last')]);
    setCounts((c) => ({ ...c, pending: outbox.length })); setConflicts(found); setLast(lastAt);
    return outbox.length;
  }, [mode]);

  const run = useCallback(async () => {
    if (running.current || offReason || !accountId) return;
    if (online === false) { setStatus('offline'); return; }
    running.current = true; setStatus('syncing');
    try {
      const repo = await openRawRepository(mode);
      const uid = userIdFor(mode);
      const report: SyncReport = await runSync({ repo, userId: uid, accountId, now: appNow,
        remote: createHttpRemote({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey, getToken: auth.getToken }) });
      if (report.status === 'ok') await repo.putSetting(uid, 'sync.last', appNow().toISOString());
      setStatus(report.status === 'ok' ? 'idle' : report.status === 'wrong_account' ? 'wrong_account' : 'failed');
      setCounts({ pending: report.pending, rejected: report.rejected });
      await readLocal();
      if (report.pulled > 0 || report.merged > 0 || report.needsReview > 0) await refresh();
    } catch { setStatus('failed'); } finally { running.current = false; }
  }, [offReason, accountId, online, mode, auth.getToken, readLocal, refresh]);

  // when sync becomes possible, when the phone is back online, and when the app returns to the front
  useEffect(() => { if (!ready) return; if (offReason) { setStatus('off'); return; } void run(); }, [ready, offReason, accountId, online]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && !offReason && ready) void run(); });
    return () => sub.remove();
  }, [offReason, ready, run]);

  // a few seconds after the ledger changes, if anything is waiting to be sent
  useEffect(() => {
    if (!ready || offReason) return;
    let cancelled = false;
    readLocal().then((n) => {
      if (cancelled || n === 0) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(), DEBOUNCE_MS);
    }).catch(() => undefined);
    return () => { cancelled = true; if (timer.current) clearTimeout(timer.current); };
  }, [state, ready, offReason]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolveConflict = useCallback<SyncValue['resolveConflict']>(async (id, choice) => {
    const repo = await openRawRepository(mode);
    const uid = userIdFor(mode);
    const c = (await repo.listConflicts(uid)).find((x) => x.id === id);
    if (!c) return { ok: true };
    if (choice === 'use_mine') {
      // applied as a normal edit on top of the server's version, so it is validated and synced like any other change
      const r = await updateTransaction(id, draftFromTransaction(c.local));
      if (!r.ok) return { ok: false, message: r.message };
    }
    await repo.removeConflict(uid, id);
    await readLocal();
    void run();
    return { ok: true };
  }, [mode, updateTransaction, readLocal, run]);

  const value = useMemo<SyncValue>(() => ({
    status: offReason ? 'off' : status, offReason, lastSyncedAt: last, pending: counts.pending, rejected: counts.rejected, conflicts, syncNow: run, resolveConflict,
  }), [status, offReason, last, counts, conflicts, run, resolveConflict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync(): SyncValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSync must be used inside <SyncProvider>');
  return v;
}
