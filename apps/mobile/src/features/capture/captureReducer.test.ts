import { describe, expect, it } from 'vitest';
import type { CaptureResult, EditableDraft, Transaction } from '@nomi/core';
import { captureReducer, initialCapture, type CaptureState } from './captureReducer';

const draft = (over: Partial<EditableDraft> = {}): EditableDraft => ({ type: 'expense', amountMinor: 45_000, currency: 'BDT', localDate: '2025-03-15', source: 'text', accountId: 'a', categoryId: 'c', ...over });
const proposal = (decision: 'one_tap' | 'confirm' | 'clarify', over: Partial<{ clarification: { field: string } | null; date: 'default' | 'stated'; account: 'default' | 'stated' }> = {}) => ({
  index: 0, draft: null, editable: draft(), issues: [], confidence: 0.9, decision, clarification: over.clarification ?? null,
  fields: { date: { value: 'x', confidence: 1, provenance: over.date ?? 'default' }, account: { value: 'a', confidence: 1, provenance: over.account ?? 'stated' } },
}) as never;
const ready = (...p: unknown[]): CaptureResult => ({ status: 'ready', proposals: p as never, interpretedBy: 'device' });

describe('capture reducer', () => {
  it('goes from idle to processing to review, marking what was assumed', () => {
    let s: CaptureState = captureReducer(initialCapture, { type: 'submit', text: 'Spent 450 on lunch', source: 'text' });
    expect(s).toEqual({ phase: 'processing', text: 'Spent 450 on lunch', source: 'text' });
    s = captureReducer(s, { type: 'outcome', text: 'Spent 450 on lunch', source: 'text', outcome: ready(proposal('one_tap')) });
    if (s.phase !== 'review') throw new Error(s.phase);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ decision: 'one_tap', assumed: { date: true, account: false }, saving: false, duplicate: null });
  });
  it('keeps the text and offers a way forward when interpretation fails', () => {
    for (const status of ['unavailable', 'invalid_output', 'not_a_transaction'] as const)
      expect(captureReducer({ phase: 'processing', text: 'hi', source: 'text' }, { type: 'outcome', text: 'hi', source: 'text', outcome: { status, interpretedBy: null } as CaptureResult })).toEqual({ phase: 'failed', text: 'hi', source: 'text', reason: status });
  });
  it('a clarification with a missing field is shown for review, not as a failure', () => {
    const s = captureReducer(initialCapture, { type: 'outcome', text: 'Spent 5k', source: 'text', outcome: { status: 'needs_clarification', clarification: { field: 'purpose', question: 'q', proposalIndex: null }, proposals: [proposal('clarify', { clarification: { field: 'purpose' } })] } as never });
    if (s.phase !== 'review') throw new Error(s.phase);
    expect(s.items[0]!.unsure).toBe(false);
  });
  it('a low-confidence reading with nothing missing is flagged "unsure"', () => {
    const s = captureReducer(initialCapture, { type: 'outcome', text: 'x', source: 'text', outcome: { status: 'needs_clarification', clarification: { field: 'unclear', question: 'q', proposalIndex: null }, proposals: [proposal('clarify', { clarification: { field: 'unclear' } })] } as never });
    if (s.phase !== 'review') throw new Error(s.phase);
    expect(s.items[0]!.unsure).toBe(true);
  });
  it('editing replaces the draft and clears stale warnings', () => {
    let s = captureReducer(initialCapture, { type: 'outcome', text: 'x', source: 'text', outcome: ready(proposal('one_tap')) });
    s = captureReducer(s, { type: 'duplicate', key: 'p0', existing: { id: 't' } as Transaction });
    if (s.phase !== 'review') throw new Error(s.phase);
    expect(s.items[0]!.duplicate).not.toBeNull();
    s = captureReducer(s, { type: 'edit', key: 'p0', draft: draft({ amountMinor: 55_000 }) });
    if (s.phase !== 'review') throw new Error(s.phase);
    expect(s.items[0]).toMatchObject({ duplicate: null, allowDuplicate: false, unsure: false });
    expect(s.items[0]!.draft.amountMinor).toBe(55_000);
  });
  it('a field the user sets is no longer shown as assumed', () => {
    let s = captureReducer(initialCapture, { type: 'outcome', text: 'x', source: 'text', outcome: ready(proposal('one_tap')) });
    if (s.phase !== 'review') throw new Error(s.phase);
    expect(s.items[0]!.assumed).toEqual({ date: true, account: false });
    s = captureReducer(s, { type: 'edit', key: 'p0', draft: draft({ amountMinor: 1 }) }); // an unrelated edit keeps the assumption
    if (s.phase !== 'review') throw new Error(s.phase);
    expect(s.items[0]!.assumed.date).toBe(true);
    s = captureReducer(s, { type: 'edit', key: 'p0', draft: draft({ localDate: '2025-03-14' }) });
    if (s.phase !== 'review') throw new Error(s.phase);
    expect(s.items[0]!.assumed.date).toBe(false);
  });
  it('save failure keeps everything the user entered', () => {
    let s = captureReducer(initialCapture, { type: 'manual', draft: draft() });
    s = captureReducer(s, { type: 'saving', key: 'm1' });
    if (s.phase !== 'review') throw new Error(s.phase);
    expect(s.items[0]!.saving).toBe(true);
    s = captureReducer(s, { type: 'saveFailed', key: 'm1', message: 'Could not save' });
    if (s.phase !== 'review') throw new Error(s.phase);
    expect(s.items[0]).toMatchObject({ saving: false, error: 'Could not save' });
    expect(s.items[0]!.draft.amountMinor).toBe(45_000);
  });
  it('duplicate warning can be accepted', () => {
    let s = captureReducer(initialCapture, { type: 'manual', draft: draft() });
    s = captureReducer(s, { type: 'duplicate', key: 'm1', existing: { id: 't' } as Transaction });
    s = captureReducer(s, { type: 'allowDuplicate', key: 'm1' });
    if (s.phase !== 'review') throw new Error(s.phase);
    expect(s.items[0]).toMatchObject({ allowDuplicate: true, duplicate: null });
  });
  it('discarding one of several keeps the rest; discarding the last returns to idle', () => {
    let s = captureReducer(initialCapture, { type: 'outcome', text: 'x', source: 'text', outcome: ready(proposal('one_tap'), proposal('one_tap')) });
    s = captureReducer(s, { type: 'discard', key: 'p0' });
    if (s.phase !== 'review') throw new Error(s.phase);
    expect(s.items.map((i) => i.key)).toEqual(['p1']);
    expect(captureReducer(s, { type: 'discard', key: 'p1' })).toEqual(initialCapture);
  });
  it('ignores edits when not reviewing, and resets cleanly', () => {
    expect(captureReducer(initialCapture, { type: 'edit', key: 'p0', draft: draft() })).toEqual(initialCapture);
    expect(captureReducer({ phase: 'failed', text: 'x', source: 'text', reason: 'unavailable' }, { type: 'reset' })).toEqual(initialCapture);
  });

  it('remembers that text came from voice, through processing, review and failure', () => {
    const processing = captureReducer(initialCapture, { type: 'submit', text: 'lunch 250', source: 'voice' });
    expect(processing).toEqual({ phase: 'processing', text: 'lunch 250', source: 'voice' });
    const failed = captureReducer(processing, { type: 'outcome', text: 'lunch 250', source: 'voice', outcome: { status: 'unavailable', interpretedBy: null } as CaptureResult });
    expect(failed).toMatchObject({ phase: 'failed', source: 'voice' });
  });
});
