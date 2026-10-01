import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildHomeSummary, todayIn, type HomeSummary, type LedgerSnapshot } from '@nomi/core';
import { appNow } from './clock';
import { defaultDataMode, fallbackProfile, openRepository, userIdFor, type DataMode } from './repositories';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; snapshot: LedgerSnapshot; summary: HomeSummary };

interface LedgerValue {
  state: State;
  mode: DataMode;
  setMode: (m: DataMode) => void;
  /** Reloads everything from storage without showing a loading state. Call after any write. */
  refresh: () => Promise<void>;
  /** Full reload with the loading state, for the error screen's Retry button. */
  retry: () => void;
}

const Ctx = createContext<LedgerValue | null>(null);

/** Loads the ledger for the current mode and derives the Home summary with the core's deterministic functions. */
export function LedgerProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DataMode>(defaultDataMode);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  const load = useCallback(async (m: DataMode, quiet: boolean) => {
    if (!quiet) setState({ status: 'loading' });
    try {
      const repo = await openRepository(m);
      const userId = userIdFor(m);
      const [profile, accounts, categories, people, transactions, budgets, recurringRules, goals] = await Promise.all([
        repo.getProfile(userId), repo.listAccounts(userId), repo.listCategories(userId), repo.listPeople(userId), repo.listTransactions(userId),
        repo.listBudgets(userId), repo.listRecurringRules(userId), repo.listGoals(userId),
      ]);
      const snapshot: LedgerSnapshot = { profile: profile ?? fallbackProfile(userId), accounts, categories, people, transactions, budgets, recurringRules, goals };
      const today = todayIn(snapshot.profile.timezone, appNow());
      setState({ status: 'ready', snapshot, summary: buildHomeSummary(snapshot, today) });
    } catch {
      // Deliberately no error details: storage errors can contain SQL with financial values.
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => { void load(mode, false); }, [mode, version, load]);

  const value = useMemo<LedgerValue>(() => ({
    state, mode,
    setMode: (m) => setModeState(m),
    refresh: async () => { await load(mode, true); },
    retry: () => setVersion((v) => v + 1), // forces a reload even when the mode has not changed
  }), [state, mode, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLedger(): LedgerValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLedger must be used inside <LedgerProvider>');
  return v;
}
