import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Crypto from 'expo-crypto';
import { ACCOUNT_EDIT_MESSAGES, CATEGORY_MESSAGES, PERSON_MESSAGES, buildCategory, buildPerson, canArchiveAccount, canArchiveCategory, validateAccountEdit, validateCategory, validatePerson, type AccountEdit, type CategoryInput, type Person, GOAL_ISSUE_MESSAGES, buildGoal, validateGoalInput, type GoalInput, REMINDER_DEFAULT_HOUR, buildExport, exportFileName, transactionsToCsv, ACCOUNT_ISSUE_MESSAGES, RECURRING_ISSUE_MESSAGES, buildRadar, buildRecurringRule, payOccurrence, validateRecurringInput, type RadarSignal, type RecurringInput, BUDGET_ISSUE_MESSAGES, buildBudget, parseBuffer, validateBudgetInput, type BudgetInput, TransactionService, ValidationError, finalizeDraft, type EditableDraft, buildAccount, buildHomeSummary, todayIn, validateNewAccount, type Account, type AccountIssue, type HomeSummary, type NewAccountInput, type LedgerSnapshot, type Profile, type Transaction, type TransactionInput } from '@nomi/core';
import { appNow } from './clock';
import { defaultDataMode, fallbackProfile, openRepository, userIdFor, type DataMode } from './repositories';

export interface ReminderSettings { enabled: boolean; hour: number }

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; snapshot: LedgerSnapshot; summary: HomeSummary; /** Things worth attention right now: de-duplicated, capped, minus what the user dismissed. */ radar: RadarSignal[]; /** Reminder choices for this device. */ reminders: ReminderSettings; /** A fresh real ledger that has not finished setup. Never true for demo data. */ needsOnboarding: boolean };

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
  /** Creates or replaces the budget for a category (null = overall). Bad input comes back as messages, not an exception. */
  saveBudget: (input: BudgetInput) => Promise<{ ok: true } | { ok: false; messages: string[] }>;
  deleteBudget: (id: string) => Promise<void>;
  /** Creates a recurring bill or income, or changes one (pass its id). Bad input comes back as messages. */
  saveRecurring: (input: RecurringInput, editingId?: string | null) => Promise<{ ok: true } | { ok: false; messages: string[] }>;
  /** Pauses or resumes a recurring rule. Paused rules never come due; nothing already recorded changes. */
  setRecurringActive: (id: string, active: boolean) => Promise<void>;
  /** Records the payment for one due date of a rule, dated today and linked to that occurrence. */
  markPaid: (ruleId: string, occurrenceDate: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Hides a Radar signal. It stays hidden for that month or item only. */
  dismissSignal: (key: string) => Promise<void>;
  /** Adds a friend (or renames one). Returns the person so a question in the middle of capture can use them at once. */
  savePerson: (name: string, editingId?: string | null) => Promise<{ ok: true; person: Person } | { ok: false; messages: string[] }>;
  /** Changes an account's name, type, whether it counts as spendable, or its starting balance. */
  editAccount: (id: string, edit: AccountEdit) => Promise<{ ok: true } | { ok: false; messages: string[] }>;
  /** Hides an account from pickers (its history stays) or brings it back. The last live account cannot be archived. */
  archiveAccount: (id: string, archived: boolean) => Promise<{ ok: true } | { ok: false; message: string }>;
  saveCategory: (input: CategoryInput, editingId?: string | null) => Promise<{ ok: true } | { ok: false; messages: string[] }>;
  archiveCategory: (id: string, archived: boolean) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Creates or changes a savings goal (pass its id). It feeds Safe to Spend straight away. Bad input comes back as messages. */
  saveGoal: (input: GoalInput, editingId?: string | null) => Promise<{ ok: true } | { ok: false; messages: string[] }>;
  /** Saves this device's bill-reminder choice. Scheduling itself is done by the reminder scheduler. */
  setReminders: (s: ReminderSettings) => Promise<void>;
  /** Everything stored on this device as a JSON document and a transactions CSV. Nothing is sent anywhere. */
  exportAll: () => Promise<{ json: string; csv: string; jsonName: string; csvName: string }>;
  /** Erases everything on this device for the current data set and starts the first-run flow again. Does not touch a server account. */
  deleteLocalData: () => Promise<void>;
  /** Sets how much Safe to Spend keeps untouched. Empty or 0 means no buffer. */
  setSafetyBuffer: (text: string) => Promise<{ ok: true } | { ok: false; message: string }>;
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
      const [stored, accounts, categories, people, transactions, budgets, recurringRules, goals, dismissed, remindersOn, remindersHour] = await Promise.all([
        repo.getProfile(userId), repo.listAccounts(userId), repo.listCategories(userId), repo.listPeople(userId), repo.listTransactions(userId),
        repo.listBudgets(userId), repo.listRecurringRules(userId), repo.listGoals(userId), repo.listDismissedSignals(userId),
        repo.getSetting(userId, 'reminders.enabled'), repo.getSetting(userId, 'reminders.hour'),
      ]);
      const profile = stored;
      const snapshot: LedgerSnapshot = { profile: profile ?? fallbackProfile(userId), accounts, categories, people, transactions, budgets, recurringRules, goals };
      const today = todayIn(snapshot.profile.timezone, appNow());
      const summary = buildHomeSummary(snapshot, today);
      setState({ status: 'ready', snapshot, summary, radar: buildRadar(snapshot, summary, today, dismissed), reminders: { enabled: remindersOn === '1', hour: Number(remindersHour ?? REMINDER_DEFAULT_HOUR) }, needsOnboarding: m === 'real' && (!stored || !stored.onboardedAt) });
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
    saveRecurring: async (input, editingId) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const { profile, accounts, categories, recurringRules } = state.snapshot;
      const { issues, amountMinor } = validateRecurringInput(input, accounts, categories, profile.currency);
      if (issues.length || amountMinor === null) return { ok: false, messages: issues.map((i) => RECURRING_ISSUE_MESSAGES[i]) };
      const repo = await openRepository(mode);
      const existing = editingId ? recurringRules.find((r) => r.id === editingId) ?? null : null;
      await repo.putRecurringRule(userIdFor(mode), buildRecurringRule(userIdFor(mode), Crypto.randomUUID(), input, amountMinor, profile.currency, existing));
      await load(mode, true);
      return { ok: true };
    },
    setRecurringActive: async (id, active) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const rule = state.snapshot.recurringRules.find((r) => r.id === id);
      if (!rule) return;
      await (await openRepository(mode)).putRecurringRule(userIdFor(mode), { ...rule, active });
      await load(mode, true);
    },
    markPaid: async (ruleId, occurrenceDate) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const rule = state.snapshot.recurringRules.find((r) => r.id === ruleId);
      if (!rule) return { ok: false, message: 'That bill is no longer there.' };
      const profile = state.snapshot.profile;
      const service = new TransactionService(await openRepository(mode), { now: appNow, newId: () => Crypto.randomUUID(), timezone: profile.timezone });
      try { await service.create(userIdFor(mode), payOccurrence(rule, occurrenceDate, state.summary.today)); } catch (e) {
        return { ok: false, message: e instanceof ValidationError && e.issues.some((i) => i.code === 'occurrence_already_recorded') ? 'That one is already recorded.' : "Couldn't record the payment. Nothing was changed." };
      }
      await load(mode, true);
      return { ok: true };
    },
    savePerson: async (name, editingId) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const issues = validatePerson(name, state.snapshot.people, editingId ?? null);
      if (issues.length) return { ok: false, messages: issues.map((i) => PERSON_MESSAGES[i]) };
      const existing = editingId ? state.snapshot.people.find((p) => p.id === editingId) ?? null : null;
      const person = buildPerson(userIdFor(mode), Crypto.randomUUID(), name, existing);
      await (await openRepository(mode)).putPerson(userIdFor(mode), person);
      await load(mode, true);
      return { ok: true, person };
    },
    editAccount: async (id, edit) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const acc = state.snapshot.accounts.find((a) => a.id === id);
      if (!acc) return { ok: false, messages: ['That account is no longer there.'] };
      const { issues, openingBalanceMinor } = validateAccountEdit(edit, state.snapshot.accounts, id, acc.currency);
      if (issues.length || openingBalanceMinor === null) return { ok: false, messages: issues.map((i) => ACCOUNT_EDIT_MESSAGES[i]) };
      await (await openRepository(mode)).putAccount(userIdFor(mode), { ...acc, name: edit.name.trim(), type: edit.type, includeInLiquid: edit.includeInLiquid, openingBalanceMinor });
      await load(mode, true);
      return { ok: true };
    },
    archiveAccount: async (id, archived) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const acc = state.snapshot.accounts.find((a) => a.id === id);
      if (!acc) return { ok: false, message: 'That account is no longer there.' };
      if (archived && !canArchiveAccount(state.snapshot.accounts, id)) return { ok: false, message: 'Keep at least one account. Add another first.' };
      const repo = await openRepository(mode);
      await repo.putAccount(userIdFor(mode), { ...acc, archivedAt: archived ? appNow().toISOString() : null });
      if (archived && state.snapshot.profile.defaultAccountId === id) await repo.putProfile(userIdFor(mode), { ...state.snapshot.profile, defaultAccountId: null, userId: userIdFor(mode) });
      await load(mode, true);
      return { ok: true };
    },
    saveCategory: async (input, editingId) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const cats = state.snapshot.categories;
      const issues = validateCategory(input, cats, editingId ?? null);
      if (issues.length) return { ok: false, messages: issues.map((i) => CATEGORY_MESSAGES[i]) };
      const existing = editingId ? cats.find((c) => c.id === editingId) ?? null : null;
      await (await openRepository(mode)).putCategory(userIdFor(mode), buildCategory(userIdFor(mode), `cat.u.${Crypto.randomUUID()}`, input, existing));
      await load(mode, true);
      return { ok: true };
    },
    archiveCategory: async (id, archived) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const cats = state.snapshot.categories;
      const c = cats.find((x) => x.id === id);
      if (!c) return { ok: false, message: 'That category is no longer there.' };
      if (archived) { const can = canArchiveCategory(cats, id); if (!can.ok) return { ok: false, message: can.reason === 'system_readonly' ? CATEGORY_MESSAGES.system_readonly : 'Archive its sub-categories first.' }; }
      await (await openRepository(mode)).putCategory(userIdFor(mode), { ...c, archivedAt: archived ? appNow().toISOString() : null });
      await load(mode, true);
      return { ok: true };
    },
    saveGoal: async (input, editingId) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const { profile, goals } = state.snapshot;
      const v = validateGoalInput(input, goals, editingId ?? null, profile.currency, state.summary.today);
      if (v.issues.length || v.targetMinor === null) return { ok: false, messages: v.issues.map((i) => GOAL_ISSUE_MESSAGES[i]) };
      const existing = editingId ? goals.find((g) => g.id === editingId) ?? null : null;
      await (await openRepository(mode)).putGoal(userIdFor(mode), buildGoal(userIdFor(mode), Crypto.randomUUID(), input, { targetMinor: v.targetMinor, monthlyMinor: v.monthlyMinor, savedMinor: v.savedMinor }, profile.currency, existing));
      await load(mode, true);
      return { ok: true };
    },
    setReminders: async (r) => {
      const repo = await openRepository(mode);
      await repo.putSetting(userIdFor(mode), 'reminders.enabled', r.enabled ? '1' : '0');
      await repo.putSetting(userIdFor(mode), 'reminders.hour', String(Math.min(23, Math.max(0, Math.round(r.hour)))));
      await load(mode, true);
    },
    exportAll: async () => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const repo = await openRepository(mode);
      const uid = userIdFor(mode);
      const [transactions, audit] = await Promise.all([repo.listTransactions(uid, { includeDeleted: true }), repo.listAudit(uid)]);
      const s = state.snapshot, now = appNow();
      const doc = buildExport({ profile: s.profile, accounts: s.accounts, categories: s.categories, people: s.people, goals: s.goals, recurringRules: s.recurringRules, budgets: s.budgets, transactions, audit }, now);
      return { json: JSON.stringify(doc, null, 2), csv: transactionsToCsv(transactions, s.accounts, s.categories, s.people), jsonName: exportFileName(now, 'json'), csvName: exportFileName(now, 'csv') };
    },
    deleteLocalData: async () => {
      if (mode !== 'real') throw new Error('Demo data is not yours to delete');
      await (await openRepository(mode)).deleteAllUserData(userIdFor(mode));
      setVersion((v) => v + 1);
    },
    dismissSignal: async (key) => {
      await (await openRepository(mode)).dismissSignal(userIdFor(mode), key, appNow().toISOString());
      await load(mode, true);
    },
    saveBudget: async (input) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const currency = state.snapshot.profile.currency;
      const { issues, amountMinor } = validateBudgetInput(input, state.snapshot.categories, currency);
      if (issues.length || amountMinor === null) return { ok: false, messages: issues.map((i) => BUDGET_ISSUE_MESSAGES[i]) };
      const repo = await openRepository(mode);
      await repo.putBudget(userIdFor(mode), buildBudget(userIdFor(mode), () => Crypto.randomUUID(), input, amountMinor, currency, state.snapshot.budgets));
      await load(mode, true);
      return { ok: true };
    },
    deleteBudget: async (id) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      await (await openRepository(mode)).deleteBudget(userIdFor(mode), id);
      await load(mode, true);
    },
    setSafetyBuffer: async (text) => {
      if (state.status !== 'ready') throw new Error('Ledger is not ready');
      const minor = parseBuffer(text, state.snapshot.profile.currency);
      if (minor === null) return { ok: false, message: 'Enter the buffer as a number like 2000 or 2k, or leave it empty for none.' };
      const repo = await openRepository(mode);
      await repo.putProfile(userIdFor(mode), { ...state.snapshot.profile, safetyBufferMinor: minor, userId: userIdFor(mode) });
      await load(mode, true);
      return { ok: true };
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
