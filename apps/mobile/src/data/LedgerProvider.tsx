import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Crypto from 'expo-crypto';
import { TransactionService, buildHomeSummary, todayIn, type HomeSummary, type LedgerSnapshot, type Profile, type Transaction, type TransactionInput } from '@nomi/core';
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
  /** Reloads everything from storage without showing a loading state. Returns the fresh summary (null if loading failed). */
  refresh: () => Promise<HomeSummary | null>;
  /** Saves a transaction through the validated write path, reloads, and returns the saved row with the new summary. Throws if validation or storage fails. */
  commit: (input: TransactionInput) => Promise<{ transaction: Transaction; summary: HomeSummary | null }>;
  /** Soft-deletes a transaction (used by Undo) and reloads. */
  undo: (id: string) => Promise<HomeSummary | null>;
  /** Saves a change to the user's settings (for example the AI-processing choice) and reloads. */
  updateProfile: (patch: Partial<Omit<Profile, 'userId'>>) => Promise<void>;
  /** Full reload with the loading state, for the error screen's Retry button. */
  retry: () => void;
}

const Ctx = createContext<LedgerValue | null>(null);

/** Loads the ledger for the current mode and derives the Home summary with the core's deterministic functions. */
export function LedgerProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DataMode>(defaultDataMode);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  const load = useCallback(async (m: DataMode, quiet: boolean): Promise<HomeSummary | null> => {
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
      const summary = buildHomeSummary(snapshot, today);
      setState({ status: 'ready', snapshot, summary });
      return summary;
    } catch {
      // Deliberately no error details: storage errors can contain SQL with financial values.
      setState({ status: 'error' });
      return null;
    }
  }, []);

  useEffect(() => { void load(mode, false); }, [mode, version, load]);

  const value = useMemo<LedgerValue>(() => ({
    state, mode,
    setMode: (m) => setModeState(m),
    refresh: () => load(mode, true),
    commit: async (input) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const repo = await openRepository(mode);
      const profile = state.snapshot.profile;
      const service = new TransactionService(repo, { now: appNow, newId: () => Crypto.randomUUID(), timezone: profile.timezone, retainRawInput: profile.retainRawInput });
      const transaction = await service.create(userIdFor(mode), input);
      return { transaction, summary: await load(mode, true) };
    },
    updateProfile: async (patch) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const repo = await openRepository(mode);
      await repo.putProfile(userIdFor(mode), { ...state.snapshot.profile, ...patch, userId: userIdFor(mode) });
      await load(mode, true);
    },
    undo: async (id) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const repo = await openRepository(mode);
      const profile = state.snapshot.profile;
      const service = new TransactionService(repo, { now: appNow, newId: () => Crypto.randomUUID(), timezone: profile.timezone });
      await service.remove(userIdFor(mode), id);
      return load(mode, true);
    },
    retry: () => setVersion((v) => v + 1), // forces a reload even when the mode has not changed
  }), [state, mode, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLedger(): LedgerValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLedger must be used inside <LedgerProvider>');
  return v;
}
