/**
 * Product analytics that cannot carry financial or personal content, by construction.
 *
 * Every event has a fixed name and a fixed set of properties, and every property is one of: a value from a short list of allowed words,
 * a yes/no, or a count put into a coarse bucket. There is no free-text property and no way to attach an amount, a name, a merchant, a
 * category, a note, a sentence, an account or a date. Anything that does not fit is dropped before it reaches the sink. There are no user
 * identifiers either: the numbers are counts across everyone who opted in, never a story about one person.
 */
type Rule = { kind: 'enum'; values: readonly string[] } | { kind: 'bool' } | { kind: 'bucket' };

const BUCKETS = ['0', '1', '2-5', '6-20', '21+'] as const;
export type CountBucket = (typeof BUCKETS)[number];
export const bucketCount = (n: number): CountBucket => (n <= 0 ? '0' : n === 1 ? '1' : n <= 5 ? '2-5' : n <= 20 ? '6-20' : '21+');

const SOURCE = ['text', 'voice', 'manual'] as const;
const VOICE_FAILURE = ['denied', 'unavailable', 'no_speech', 'network', 'language', 'interrupted', 'unknown'] as const;

/** The complete list of what can be measured. Adding something here is a deliberate, reviewed act. */
export const EVENT_SCHEMA = {
  app_opened: {},
  onboarding_step_done: { step: { kind: 'enum', values: ['welcome', 'about', 'auth', 'goals', 'account', 'confirm', 'budget', 'try'] } },
  onboarding_finished: { first_capture_done: { kind: 'bool' } },
  capture_submitted: { source: { kind: 'enum', values: SOURCE }, interpreter: { kind: 'enum', values: ['model', 'device'] } },
  capture_outcome: { outcome: { kind: 'enum', values: ['ready', 'needs_clarification', 'not_a_transaction', 'unavailable', 'invalid_output'] }, source: { kind: 'enum', values: SOURCE } },
  capture_saved: { source: { kind: 'enum', values: SOURCE }, edited: { kind: 'bool' }, items: { kind: 'bucket' } },
  capture_discarded: { source: { kind: 'enum', values: SOURCE } },
  voice_failed: { reason: { kind: 'enum', values: VOICE_FAILURE } },
  radar_opened: { kind: { kind: 'enum', values: ['bill_overdue', 'bill_due_soon', 'cash_short', 'budget_over', 'budget_at_risk', 'spending_pace', 'possible_duplicate', 'large_expense'] } },
  radar_dismissed: { kind: { kind: 'enum', values: ['bill_overdue', 'bill_due_soon', 'cash_short', 'budget_over', 'budget_at_risk', 'spending_pace', 'possible_duplicate', 'large_expense'] } },
  export_used: { format: { kind: 'enum', values: ['json', 'csv'] } },
  sync_finished: { status: { kind: 'enum', values: ['ok', 'failed', 'wrong_account'] }, conflicts: { kind: 'bucket' } },
} as const satisfies Record<string, Record<string, Rule>>;

export type EventName = keyof typeof EVENT_SCHEMA;
export interface AnalyticsEvent { name: EventName; props: Record<string, string | boolean> }

/**
 * Checks an event against the schema and returns a clean copy, or null if the name is unknown or any property is missing or outside its
 * allowed values. Extra properties are dropped. It never throws and never echoes what it rejected.
 */
export function sanitizeEvent(name: string, props: Record<string, unknown> = {}): AnalyticsEvent | null {
  const schema = (EVENT_SCHEMA as Record<string, Record<string, Rule>>)[name];
  if (!schema || !Object.prototype.hasOwnProperty.call(EVENT_SCHEMA, name)) return null;
  const clean: Record<string, string | boolean> = {};
  for (const [key, rule] of Object.entries(schema)) {
    const v = props[key];
    if (rule.kind === 'bool') { if (typeof v !== 'boolean') return null; clean[key] = v; }
    else if (rule.kind === 'enum') { if (typeof v !== 'string' || !rule.values.includes(v)) return null; clean[key] = v; }
    else { if (typeof v !== 'string' || !(BUCKETS as readonly string[]).includes(v)) return null; clean[key] = v; }
  }
  return { name: name as EventName, props: clean };
}

/** Where events go. Implemented by a vendor adapter later; the product ships with none, so by default nothing leaves the device. */
export interface AnalyticsSink { send(events: AnalyticsEvent[]): Promise<void> }

export class Analytics {
  private queue: AnalyticsEvent[] = [];
  constructor(private sink: AnalyticsSink | null, private enabled: () => boolean, private maxQueue = 50) {}

  /** Records an event if the person has opted in. Off by default, so this does nothing until they say yes. */
  track(name: EventName, props: Record<string, unknown> = {}): void {
    if (!this.enabled() || !this.sink) return;
    const e = sanitizeEvent(name, props);
    if (!e) return;
    this.queue.push(e);
    if (this.queue.length > this.maxQueue) this.queue.shift();
  }

  async flush(): Promise<void> {
    if (!this.sink || !this.enabled() || !this.queue.length) { if (!this.enabled()) this.queue = []; return; }
    const batch = this.queue.splice(0, this.queue.length);
    try { await this.sink.send(batch); } catch { /* analytics must never affect the app; the batch is dropped */ }
  }

  /** Turning it off also forgets anything not yet sent. */
  clear(): void { this.queue = []; }
}
