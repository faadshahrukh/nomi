import { captureText, type CaptureResult } from '../capture';
import { extractAmounts } from '../money';
import type { Interpreter } from '../ai';
import type { LedgerSnapshot } from '../homeSummary';

export type EvalTag = 'en' | 'bn' | 'mixed' | 'date' | 'shared' | 'transfer' | 'income' | 'refund' | 'debt' | 'goal' | 'multi' | 'ambiguous' | 'speech' | 'negative' | 'merchant' | 'account' | 'category' | 'no_amount';

export interface ExpectedProposal {
  type?: string; amountMinor?: number; categoryId?: string | null; merchantName?: string | null; accountId?: string | null; toAccountId?: string | null;
  localDate?: string; paidBy?: string; decision?: string;
}

export interface EvalCase {
  id: string; text: string; tags: EvalTag[]; source?: 'text' | 'voice';
  expect: { status: 'ready' | 'needs_clarification' | 'not_a_transaction'; clarifyField?: string; proposals?: ExpectedProposal[] };
  /** Interpreters known to miss this case, with why. The case still states the right answer; it is just not counted against that interpreter's gate. */
  knownGap?: Partial<Record<'rules' | 'model', string>>;
}

export interface CaseResult {
  id: string; tags: EvalTag[]; passed: boolean; fieldsChecked: number; fieldsCorrect: number; statusCorrect: boolean;
  /** What went wrong, in words, without the text of the case: for the report. */
  misses: string[];
  /** Safety rules broken, which are never acceptable regardless of accuracy. */
  violations: string[];
  knownGap: string | null;
}

/** Hard rules that must hold for every case, whoever the interpreter is. These are the product's promises, not accuracy goals. */
function violationsFor(c: EvalCase, out: CaptureResult): string[] {
  const v: string[] = [];
  const props = 'proposals' in out ? out.proposals : [];
  if (c.source === 'voice' && props.some((p) => p.decision === 'one_tap' || p.decision === 'auto_save')) v.push('voice was not held for a confirmation tap');
  if (c.tags.includes('no_amount') && (out.status === 'ready' || props.some((p) => p.editable.amountMinor !== null))) v.push('an amount was invented where the text gave none');
  if (c.tags.includes('ambiguous') && out.status === 'ready') v.push('an ambiguous message was accepted without a question');
  if (c.tags.includes('transfer') && props.some((p) => p.editable.type === 'transfer' && p.editable.accountId && !/\b(from|withdr|deposit)|থেকে|তুললাম/i.test(c.text) && !c.expect.proposals?.some((e) => e.accountId))) v.push('a transfer assumed its source account');
  for (const p of props) {
    const given = extractAmounts(c.text, 'BDT');
    if (p.editable.amountMinor !== null && given.length && !given.includes(p.editable.amountMinor) && !p.editable.splits) v.push('an amount was not one the text contains');
  }
  return v;
}

export async function runEval(opts: { interpreter: Interpreter; snapshot: LedgerSnapshot; cases: EvalCase[]; now: Date; interpreterName?: 'rules' | 'model' }): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  for (const c of opts.cases) {
    const out = await captureText({ text: c.text, source: c.source ?? 'text', snapshot: opts.snapshot, interpreter: opts.interpreter, now: opts.now });
    const misses: string[] = [];
    let checked = 1, correct = 0;
    const statusCorrect = out.status === c.expect.status;
    if (statusCorrect) correct++; else misses.push(`status ${out.status}, wanted ${c.expect.status}`);
    if (c.expect.clarifyField && out.status === 'needs_clarification') { checked++; if (out.clarification.field === c.expect.clarifyField) correct++; else misses.push(`asked about ${out.clarification.field}, wanted ${c.expect.clarifyField}`); }
    else if (c.expect.clarifyField) checked++;
    const props = 'proposals' in out ? out.proposals : [];
    c.expect.proposals?.forEach((exp, i) => {
      const got = props[i];
      for (const [k, want] of Object.entries(exp)) {
        checked++;
        const have = k === 'decision' ? got?.decision : (got?.editable as unknown as Record<string, unknown> | undefined)?.[k];
        if (got && JSON.stringify(have ?? null) === JSON.stringify(want ?? null)) correct++; else misses.push(`#${i + 1} ${k}: ${JSON.stringify(have ?? null)}, wanted ${JSON.stringify(want)}`);
      }
    });
    if (c.expect.proposals && props.length !== c.expect.proposals.length) { checked++; misses.push(`${props.length} transactions, wanted ${c.expect.proposals.length}`); }
    else if (c.expect.proposals) { checked++; correct++; }
    results.push({ id: c.id, tags: c.tags, passed: correct === checked, fieldsChecked: checked, fieldsCorrect: correct, statusCorrect, misses, violations: violationsFor(c, out), knownGap: c.knownGap?.[opts.interpreterName ?? 'rules'] ?? null });
  }
  return results;
}

export interface EvalSummary { cases: number; passed: number; passRate: number; fieldAccuracy: number; statusAccuracy: number; violations: number; byTag: Record<string, { cases: number; passRate: number }> }

/** Aggregates results. Cases with a recorded known gap are left out of the pass rate so a gate cannot be met by deleting hard cases, only by listing them. */
export function summarize(results: CaseResult[], opts: { includeKnownGaps?: boolean } = {}): EvalSummary {
  const counted = opts.includeKnownGaps ? results : results.filter((r) => !r.knownGap);
  const sum = (f: (r: CaseResult) => number) => counted.reduce((s, r) => s + f(r), 0);
  const byTag: EvalSummary['byTag'] = {};
  for (const r of counted) for (const t of r.tags) { const b = (byTag[t] ??= { cases: 0, passRate: 0 }); b.cases++; b.passRate += r.passed ? 1 : 0; }
  for (const b of Object.values(byTag)) b.passRate = b.passRate / b.cases;
  return {
    cases: counted.length, passed: counted.filter((r) => r.passed).length, passRate: counted.filter((r) => r.passed).length / Math.max(1, counted.length),
    fieldAccuracy: sum((r) => r.fieldsCorrect) / Math.max(1, sum((r) => r.fieldsChecked)), statusAccuracy: counted.filter((r) => r.statusCorrect).length / Math.max(1, counted.length),
    violations: results.reduce((s, r) => s + r.violations.length, 0), byTag,
  };
}
