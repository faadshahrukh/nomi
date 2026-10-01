import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Crypto from 'expo-crypto';
import { ACCOUNT_ISSUE_MESSAGES, TransactionService, ValidationError, finalizeDraft, type EditableDraft, buildAccount, buildHomeSummary, todayIn, validateNewAccount, type Account, type AccountIssue, type HomeSummary, type NewAccountInput, type LedgerSnapshot, type Profile, type Transaction, type TransactionInput } from '@nomi/core';
import { appNow } from './clock';
import { defaultDataMode, fallbackProfile, openRepository, userIdFor, type DataMode } from './repositories';

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; snapshot: LedgerSnapshot; summary: HomeSummary; /** A fresh real ledger that has not finished setup. Never true for demo data. */ needsOnboarding: boolean };

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
  /** Saves a corrected transaction through the same validation as a new one. Returns a plain message instead of throwing for rejected edits. */
  updateTransaction: (id: string, draft: EditableDraft) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Brings back a deleted transaction (the Undo after a delete). */
  restoreTransaction: (id: string) => Promise<HomeSummary | null>;
  /** Saves a change to the user's settings (for example the AI-processing choice) and reloads. */
  updateProfile: (patch: Partial<Omit<Profile, 'userId'>>) => Promise<void>;
  /** Validates and saves a new account. The first account becomes the default. Returns the problems instead of throwing for bad input. */
  addAccount: (input: NewAccountInput) => Promise<{ ok: true; account: Account } | { ok: false; issues: AccountIssue[]; messages: string[] }>;
  /** Sets (or replaces) the overall monthly budget. */
  setOverallBudget: (amountMinor: number) => Promise<void>;
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
      const [stored, accounts, categories, people, transactions, budgets, recurringRules, goals] = await Promise.all([
        repo.getProfile(userId), repo.listAccounts(userId), repo.listCategories(userId), repo.listPeople(userId), repo.listTransactions(userId),
        repo.listBudgets(userId), repo.listRecurringRules(userId), repo.listGoals(userId),
      ]);
      const profile = stored;
      const snapshot: LedgerSnapshot = { profile: profile ?? fallbackProfile(userId), accounts, categories, people, transactions, budgets, recurringRules, goals };
      const today = todayIn(snapshot.profile.timezone, appNow());
      const summary = buildHomeSummary(snapshot, today);
      setState({ status: 'ready', snapshot, summary, needsOnboarding: m === 'real' && (!stored || !stored.onboardedAt) });
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
    updateTransaction: async (id, draft) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const input = finalizeDraft(draft);
      if (!input) return { ok: false, message: 'Add an amount first.' };
      const repo = await openRepository(mode);
      const profile = state.snapshot.profile;
      const service = new TransactionService(repo, { now: appNow, newId: () => Crypto.randomUUID(), timezone: profile.timezone, retainRawInput: profile.retainRawInput });
      try { await service.update(userIdFor(mode), id, input); } catch (e) {
        // Deliberately generic for storage errors: they can echo SQL containing amounts and names.
        return { ok: false, message: e instanceof ValidationError ? e.issues[0]?.message ?? 'Some details are not valid.' : "Couldn't save the change. Your original is unchanged." };
      }
      await load(mode, true);
      return { ok: true };
    },
    restoreTransaction: async (id) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const repo = await openRepository(mode);
      const profile = state.snapshot.profile;
      await new TransactionService(repo, { now: appNow, newId: () => Crypto.randomUUID(), timezone: profile.timezone }).restore(userIdFor(mode), id);
      return load(mode, true);
    },
    updateProfile: async (patch) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const repo = await openRepository(mode);
      await repo.putProfile(userIdFor(mode), { ...state.snapshot.profile, ...patch, userId: userIdFor(mode) });
      await load(mode, true);
    },
    addAccount: async (input) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const profile = state.snapshot.profile;
      const { issues, openingBalanceMinor } = validateNewAccount(input, state.snapshot.accounts, profile.currency);
      if (issues.length || openingBalanceMinor === null) return { ok: false, issues, messages: issues.map((i) => ACCOUNT_ISSUE_MESSAGES[i]) };
      const repo = await openRepository(mode);
      const account = buildAccount(userIdFor(mode), Crypto.randomUUID(), input, profile.currency, openingBalanceMinor);
      await repo.putAccount(userIdFor(mode), account);
      if (!profile.defaultAccountId) await repo.putProfile(userIdFor(mode), { ...profile, defaultAccountId: account.id, userId: userIdFor(mode) });
      await load(mode, true);
      return { ok: true, account };
    },
    setOverallBudget: async (amountMinor) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error('Budget must be a positive amount');
      const repo = await openRepository(mode);
      const existing = state.snapshot.budgets.find((b) => b.categoryId === null);
      await repo.putBudget(userIdFor(mode), { id: existing?.id ?? Crypto.randomUUID(), userId: userIdFor(mode), categoryId: null, amountMinor, currency: state.snapshot.profile.currency });
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
