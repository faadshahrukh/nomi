import type { CaptureOutcome, Decision, EditableDraft, Transaction } from '@nomi/core';

/** One transaction being reviewed. Several can be reviewed at once ("800 on groceries and 300 on Uber"). */
export interface ReviewItem {
  key: string;
  draft: EditableDraft;
  /** How sure the engine was; 'manual' for entries the user typed themselves. */
  decision: Decision | 'manual';
  /** The engine filled these in without being told: show them as "assumed" so they are checked, not trusted. */
  assumed: { date: boolean; account: boolean };
  /** Engine confidence was low even though nothing is missing: ask the user to look it over. */
  unsure: boolean;
  duplicate: Transaction | null;
  allowDuplicate: boolean;
  saving: boolean;
  error: string | null;
}

export interface SavedEntry { id: string; label: string; amountMinor: number }

export type CaptureState =
  | { phase: 'idle' }
  | { phase: 'processing'; text: string }
  | { phase: 'review'; text: string; items: ReviewItem[] }
  | { phase: 'failed'; text: string; reason: 'unavailable' | 'invalid_output' | 'not_a_transaction' }
  | { phase: 'saved'; entries: SavedEntry[]; safeBefore: number; safeAfter: number; currency: string };

export type CaptureAction =
  | { type: 'submit'; text: string }
  | { type: 'outcome'; text: string; outcome: CaptureOutcome }
  | { type: 'manual'; draft: EditableDraft }
  | { type: 'edit'; key: string; draft: EditableDraft }
  | { type: 'discard'; key: string }
  | { type: 'saving'; key: string }
  | { type: 'saveFailed'; key: string; message: string }
  | { type: 'duplicate'; key: string; existing: Transaction }
  | { type: 'allowDuplicate'; key: string }
  | { type: 'saved'; entries: SavedEntry[]; safeBefore: number; safeAfter: number; currency: string }
  | { type: 'reset' };

export const initialCapture: CaptureState = { phase: 'idle' };

const newItem = (key: string, draft: EditableDraft, decision: ReviewItem['decision'], assumed = { date: false, account: false }, unsure = false): ReviewItem =>
  ({ key, draft, decision, assumed, unsure, duplicate: null, allowDuplicate: false, saving: false, error: null });

/** Pure transitions for the capture flow. Everything asynchronous lives in the hook; this only decides what the screen shows. */
export function captureReducer(state: CaptureState, a: CaptureAction): CaptureState {
  switch (a.type) {
    case 'submit': return { phase: 'processing', text: a.text };
    case 'reset': return initialCapture;
    case 'manual': return { phase: 'review', text: '', items: [newItem('m1', a.draft, 'manual')] };
    case 'outcome': {
      const o = a.outcome;
      if (o.status === 'unavailable') return { phase: 'failed', text: a.text, reason: 'unavailable' };
      if (o.status === 'invalid_output') return { phase: 'failed', text: a.text, reason: 'invalid_output' };
      if (o.status === 'not_a_transaction') return { phase: 'failed', text: a.text, reason: 'not_a_transaction' };
      const items = o.proposals.map((p, i) => newItem(`p${i}`, p.editable, p.decision,
        { date: p.fields.date?.provenance === 'default', account: p.fields.account?.provenance === 'default' },
        p.decision === 'clarify' && !p.clarification?.field.match(/amount|purpose|account|to_account|person|goal|direction|date/)));
      return { phase: 'review', text: a.text, items };
    }
    case 'edit': return mapItem(state, a.key, (i) => ({
      ...i, draft: a.draft, duplicate: null, allowDuplicate: false, error: null, unsure: false,
      // A field the user has set is no longer an assumption.
      assumed: { account: i.assumed.account && a.draft.accountId === i.draft.accountId, date: i.assumed.date && a.draft.localDate === i.draft.localDate },
    }));
    case 'saving': return mapItem(state, a.key, (i) => ({ ...i, saving: true, error: null }));
    case 'saveFailed': return mapItem(state, a.key, (i) => ({ ...i, saving: false, error: a.message }));
    case 'duplicate': return mapItem(state, a.key, (i) => ({ ...i, saving: false, duplicate: a.existing }));
    case 'allowDuplicate': return mapItem(state, a.key, (i) => ({ ...i, allowDuplicate: true, duplicate: null }));
    case 'discard': {
      if (state.phase !== 'review') return state;
      const items = state.items.filter((i) => i.key !== a.key);
      return items.length ? { ...state, items } : initialCapture;
    }
    case 'saved': return { phase: 'saved', entries: a.entries, safeBefore: a.safeBefore, safeAfter: a.safeAfter, currency: a.currency };
  }
}

function mapItem(state: CaptureState, key: string, f: (i: ReviewItem) => ReviewItem): CaptureState {
  return state.phase === 'review' ? { ...state, items: state.items.map((i) => (i.key === key ? f(i) : i)) } : state;
}
