import { describe, expect, it } from 'vitest';
import { Analytics, EVENT_SCHEMA, bucketCount, sanitizeEvent, type AnalyticsEvent, type AnalyticsSink } from '../src';

describe('analytics cannot carry financial or personal content', () => {
  it('every property in the schema is an allowed word, a yes/no or a bucket: there is no free-text or numeric property', () => {
    for (const [name, props] of Object.entries(EVENT_SCHEMA)) for (const [key, rule] of Object.entries(props as Record<string, { kind: string; values?: readonly string[] }>)) {
      expect(['enum', 'bool', 'bucket'], `${name}.${key}`).toContain(rule.kind);
      if (rule.kind === 'enum') for (const v of rule.values!) expect(v, `${name}.${key}`).toMatch(/^[a-z_]+$/); // words only, no digits or free text
    }
  });
  it('accepts a good event and returns only the known properties', () => {
    expect(sanitizeEvent('capture_saved', { source: 'voice', edited: true, items: '2-5', amount: 45_000, merchant: 'Uber', text: 'lunch 450' })).toEqual({ name: 'capture_saved', props: { source: 'voice', edited: true, items: '2-5' } });
  });
  it.each([
    ['unknown event', 'spend_total', { total: 1 }],
    ['an amount where a word is expected', 'capture_outcome', { outcome: 45000, source: 'text' }],
    ['free text where a word is expected', 'capture_outcome', { outcome: 'Spent 450 on lunch at Agora', source: 'text' }],
    ['a number where a bucket is expected', 'capture_saved', { source: 'text', edited: false, items: 3 }],
    ['an unlisted bucket', 'capture_saved', { source: 'text', edited: false, items: '1000000' }],
    ['a missing property', 'capture_saved', { source: 'text' }],
    ['a string where a boolean is expected', 'capture_saved', { source: 'text', edited: 'yes', items: '1' }],
    ['a prototype key', '__proto__', {}],
    ['constructor', 'constructor', {}],
  ])('rejects %s', (_label, name, props) => { expect(sanitizeEvent(name, props)).toBeNull(); });
  it('no event can be built that contains a digit run, an amount, an email or a name from the ledger', () => {
    const attempts = ['4500', 'rahim@example.com', 'Rahim', '৳450', '1,200', 'City Bank', 'Spent 450 on lunch'];
    for (const [name, props] of Object.entries(EVENT_SCHEMA)) for (const [key, rule] of Object.entries(props as Record<string, { kind: string }>)) for (const a of attempts) {
      const e = sanitizeEvent(name, { [key]: a });
      if (e) throw new Error(`${name}.${key} accepted ${a}`);
      void rule;
    }
  });
  it('buckets counts coarsely', () => {
    expect([0, 1, 2, 5, 6, 20, 21, 5000].map(bucketCount)).toEqual(['0', '1', '2-5', '2-5', '6-20', '6-20', '21+', '21+']);
  });
});

describe('analytics is off until the person opts in', () => {
  const make = (on: { v: boolean }) => {
    const sent: AnalyticsEvent[][] = [];
    const sink: AnalyticsSink = { send: async (e) => { sent.push(e); } };
    return { sent, a: new Analytics(sink, () => on.v) };
  };
  it('sends nothing, and keeps nothing, while off', async () => {
    const on = { v: false }; const { a, sent } = make(on);
    a.track('app_opened'); await a.flush();
    expect(sent).toEqual([]);
    on.v = true; await a.flush();
    expect(sent).toEqual([]); // what happened while off was never recorded
  });
  it('sends clean events once opted in, and forgets unsent ones when turned off again', async () => {
    const on = { v: true }; const { a, sent } = make(on);
    a.track('capture_submitted', { source: 'text', interpreter: 'device', text: 'secret' });
    a.track('capture_submitted', { source: 'bogus', interpreter: 'device' }); // invalid: dropped
    on.v = false; await a.flush();
    expect(sent).toEqual([]);
    on.v = true;
    a.track('app_opened'); await a.flush();
    expect(sent).toEqual([[{ name: 'app_opened', props: {} }]]);
  });
  it('a failing sink never breaks the app', async () => {
    const a = new Analytics({ send: async () => { throw new Error('down'); } }, () => true);
    a.track('app_opened');
    await expect(a.flush()).resolves.toBeUndefined();
  });
  it('with no sink configured (the default build) nothing can leave the device', async () => {
    const a = new Analytics(null, () => true);
    a.track('app_opened');
    await expect(a.flush()).resolves.toBeUndefined();
  });
});
