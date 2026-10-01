/**
 * Runs the labelled evaluation set against a real model and prints a report.
 *
 *   ANTHROPIC_API_KEY=... npm run eval -w @nomi/core            # the Claude interpreter (costs a few cents)
 *   npm run eval -w @nomi/core -- --rules                       # the on-device interpreter only, no key needed
 *
 * It uses exactly the production interpreter, prompt and schema. Only names and the test sentences are sent. Nothing here touches the
 * app or any user data: the ledger is the demo data. Run it before changing the prompt or the model and compare with the last report.
 */
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_CATEGORIES, EVAL_CASES, RuleBasedInterpreter, buildDemoData, runEval, summarize, type Interpreter, type LedgerSnapshot } from '../src/index.ts';
import { ClaudeInterpreter, DEFAULT_MODEL } from '../src/ai/claude/claudeInterpreter.ts';

const rulesOnly = process.argv.includes('--rules');
const demo = buildDemoData('2025-03-15');
const snapshot: LedgerSnapshot = { ...demo, categories: DEFAULT_CATEGORIES };

async function main() {
  let interpreter: Interpreter; let name: 'rules' | 'model';
  if (rulesOnly) { interpreter = new RuleBasedInterpreter(); name = 'rules'; }
  else {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) { console.error('Set ANTHROPIC_API_KEY to evaluate the model, or pass --rules.'); process.exit(2); }
    const model = process.env.INTERPRETER_MODEL ?? DEFAULT_MODEL;
    console.log(`Model: ${model}`);
    interpreter = new ClaudeInterpreter(new Anthropic({ apiKey: key }) as never, { model, effort: 'low' }); name = 'model';
  }
  const results = await runEval({ interpreter, snapshot, cases: EVAL_CASES, now: new Date('2025-03-15T10:00:00Z'), interpreterName: name });
  const s = summarize(results, { includeKnownGaps: name === 'model' });
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  console.log(`\nCases ${s.cases}  passed ${s.passed} (${pct(s.passRate)})  field accuracy ${pct(s.fieldAccuracy)}  status accuracy ${pct(s.statusAccuracy)}  safety violations ${s.violations}`);
  const all = summarize(results, { includeKnownGaps: true });
  if (name === 'rules') console.log(`Including the ${all.cases - s.cases} known gaps: ${all.passed} of ${all.cases} (${pct(all.passRate)}), field accuracy ${pct(all.fieldAccuracy)}`);
  console.log('\nBy kind of input:'); for (const [t, b] of Object.entries(s.byTag).sort()) console.log(`  ${t.padEnd(10)} ${pct(b.passRate).padStart(6)}  (${b.cases})`);
  const misses = results.filter((r) => !r.passed && (name === 'model' || !r.knownGap));
  if (misses.length) { console.log('\nMisses:'); for (const r of misses) console.log(`  ${r.id}: ${r.misses.join('; ')}`); }
  const bad = results.filter((r) => r.violations.length);
  if (bad.length) { console.log('\nSAFETY VIOLATIONS:'); for (const r of bad) console.log(`  ${r.id}: ${r.violations.join('; ')}`); process.exitCode = 1; }
}
main().catch((e) => { console.error('Evaluation failed:', (e as Error).message); process.exit(1); });
