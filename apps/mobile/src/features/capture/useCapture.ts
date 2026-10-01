import { useCallback, useMemo, useReducer, useRef } from 'react';
import {
  captureText, finalizeDraft, findPossibleDuplicate, formatMoney, reviseDraft, validateDraft,
  type EditableDraft, type LedgerData, type LedgerSnapshot,
} from '@nomi/core';
import { buildInterpreter } from '@/ai/buildInterpreter';
import { useAuth } from '@/auth/AuthProvider';
import { config } from '@/config';
import { appNow } from '@/data/clock';
import { useLedger } from '@/data/LedgerProvider';
import { userIdFor } from '@/data/repositories';
import { captureReducer, initialCapture, type ReviewItem, type SavedEntry } from './captureReducer';

const labelFor = (d: EditableDraft, snap: LedgerSnapshot): string => {
  const cat = d.categoryId ? snap.categories.find((c) => c.id === d.categoryId)?.name : null;
  return d.merchantName ?? cat ?? { expense: 'Expense', income: 'Income', transfer: 'Transfer', refund: 'Refund', debt: 'Loan', repayment: 'Repayment', savings_contribution: 'Savings', goal_contribution: 'Goal' }[d.type];
};

/**
 * Orchestrates conversational capture. It holds no financial logic: interpretation, validation, correction rules,
 * duplicate detection and saving are all core functions. This hook only sequences them and reports state to the screen.
 */
export function useCapture() {
  const { state: ledger, mode, commit, undo: undoCommit } = useLedger();
  const [state, dispatch] = useReducer(captureReducer, initialCapture);
  const auth = useAuth();
  const aiAllowed = ledger.status === 'ready' ? ledger.snapshot.profile.aiProcessing : true;
  // The AI service is used only for signed-in users who allow it; otherwise the message never leaves the device.
  const interpreter = useMemo(() => buildInterpreter({
    aiProcessing: aiAllowed, backendConfigured: auth.configured && config.backendConfigured, signedIn: auth.status === 'signedIn',
    interpretUrl: config.interpretUrl, anonKey: config.supabaseAnonKey, getToken: auth.getToken,
  }), [aiAllowed, auth.configured, auth.status, auth.getToken]);
  const batch = useRef<{ entries: SavedEntry[]; safeBefore: number | null }>({ entries: [], safeBefore: null });
  const snapshot = ledger.status === 'ready' ? ledger.snapshot : null;
  const userId = userIdFor(mode);

  const data: LedgerData | null = useMemo(() => (snapshot ? { accounts: snapshot.accounts, categories: snapshot.categories, people: snapshot.people, transactions: snapshot.transactions } : null), [snapshot]);

  /** Saves one draft. Returns true when saved. Throws nothing: failures are reported into state so the user's entry is never lost. */
  const persist = useCallback(async (key: string, draft: EditableDraft, allowDuplicate: boolean, last: boolean): Promise<boolean> => {
    if (!snapshot || !data || ledger.status !== 'ready') return false;
    const input = finalizeDraft(draft);
    if (!input || validateDraft(draft, userId, data).length) { dispatch({ type: 'saveFailed', key, message: 'Some details are still missing.' }); return false; }
    if (!allowDuplicate) {
      const dup = findPossibleDuplicate(input, snapshot.transactions);
      if (dup) { dispatch({ type: 'duplicate', key, existing: dup }); return false; }
    }
    dispatch({ type: 'saving', key });
    try {
      if (batch.current.safeBefore === null) batch.current.safeBefore = ledger.summary.safeToSpend.availableMinor;
      const { transaction, summary } = await commit(input);
      // For a shared expense the user's own cost is their share, which is also what changes their numbers.
      const mine = draft.splits?.find((s) => s.personId === 'me')?.amountMinor ?? transaction.amountMinor;
      batch.current.entries.push({ id: transaction.id, label: labelFor(draft, snapshot), amountMinor: mine });
      dispatch({ type: 'discard', key });
      if (last && summary) dispatch({ type: 'saved', entries: [...batch.current.entries], safeBefore: batch.current.safeBefore ?? 0, safeAfter: summary.safeToSpend.availableMinor, currency: summary.currency });
      return true;
    } catch {
      // Deliberately generic: error text can echo SQL containing amounts and names. The draft stays on screen.
      dispatch({ type: 'saveFailed', key, message: "Couldn't save. Your entry is still here, so you can try again." });
      return false;
    }
  }, [snapshot, data, ledger, userId, commit]);

  const submit = useCallback(async (text: string, source: 'text' | 'voice' = 'text') => {
    if (!snapshot) return;
    batch.current = { entries: [], safeBefore: null };
    dispatch({ type: 'submit', text });
    const outcome = await captureText({ text, source, snapshot, interpreter, now: appNow() });
    const only = outcome.status === 'ready' && outcome.proposals.length === 1 ? outcome.proposals[0]! : null;
    if (only && only.decision === 'auto_save' && only.draft && await persist('p0', only.editable, false, true)) return; // user opted in to auto-save: saved, with Undo
    dispatch({ type: 'outcome', text, outcome });
  }, [snapshot, interpreter, persist]);

  const startManual = useCallback(() => {
    if (!snapshot) return;
    batch.current = { entries: [], safeBefore: null };
    const live = snapshot.accounts.filter((a) => !a.archivedAt);
    const account = live.find((a) => a.id === snapshot.profile.defaultAccountId) ?? (live.length === 1 ? live[0] : undefined);
    const today = ledger.status === 'ready' ? ledger.summary.today : '';
    dispatch({ type: 'manual', draft: { type: 'expense', amountMinor: null, currency: snapshot.profile.currency, localDate: today, source: 'manual', accountId: account?.id ?? null, categoryId: null, merchantName: null, notes: null, paidBy: 'me', splits: null } });
  }, [snapshot, ledger]);

  const edit = useCallback((item: ReviewItem, patch: Partial<EditableDraft>) => {
    if (!data) return;
    dispatch({ type: 'edit', key: item.key, draft: reviseDraft(item.draft, patch, data) });
  }, [data]);

  const isLast = state.phase === 'review' && state.items.length === 1;
  const save = useCallback((item: ReviewItem) => persist(item.key, item.draft, item.allowDuplicate, isLast), [persist, isLast]);
  const saveAnyway = useCallback((item: ReviewItem) => { dispatch({ type: 'allowDuplicate', key: item.key }); return persist(item.key, item.draft, true, isLast); }, [persist, isLast]);

  /** Discards one item. If it was the last one left but others were already saved, finish with the saved confirmation. */
  const discard = useCallback((key: string) => {
    dispatch({ type: 'discard', key });
    if (isLast && batch.current.entries.length && ledger.status === 'ready') {
      dispatch({ type: 'saved', entries: [...batch.current.entries], safeBefore: batch.current.safeBefore ?? 0, safeAfter: ledger.summary.safeToSpend.availableMinor, currency: ledger.summary.currency });
    }
  }, [isLast, ledger]);

  const undo = useCallback(async () => {
    const ids = batch.current.entries.map((e) => e.id);
    batch.current = { entries: [], safeBefore: null };
    for (const id of ids) await undoCommit(id);
    dispatch({ type: 'reset' });
  }, [undoCommit]);

  return {
    state, data, snapshot, userId, submit, startManual, edit, save, saveAnyway, undo,
    discard,
    reset: () => { batch.current = { entries: [], safeBefore: null }; dispatch({ type: 'reset' }); },
    money: (minor: number) => formatMoney(minor, snapshot?.profile.currency ?? 'BDT'),
  };
}
