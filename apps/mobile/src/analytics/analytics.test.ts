import { describe, expect, it } from 'vitest';
import { createHttpSink } from './httpSink';

describe('analytics http sink', () => {
  it('posts only the events, with no identifying headers', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response('{}'); }) as unknown as typeof fetch;
    await createHttpSink('https://stats.example/ingest', f).send([{ name: 'app_opened', props: {} }]);
    expect(calls[0]!.url).toBe('https://stats.example/ingest');
    expect(Object.keys(calls[0]!.init.headers as object)).toEqual(['content-type']);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ events: [{ name: 'app_opened', props: {} }] });
  });
  it('reports a failure instead of hiding it (the caller drops the batch)', async () => {
    const f = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    await expect(createHttpSink('https://x', f).send([])).rejects.toThrow('analytics');
  });
});
