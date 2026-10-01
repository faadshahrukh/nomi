import { describe, expect, it } from 'vitest';
import { createHttpRemote } from './httpRemote';

const make = (respond: (url: string, init: RequestInit) => Response, token: string | null = 'jwt') => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return respond(url, init); }) as unknown as typeof fetch;
  return { calls, remote: createHttpRemote({ url: 'https://x.supabase.co', anonKey: 'anon-key-123', getToken: async () => token, fetchFn }) };
};

describe('http sync remote', () => {
  it('calls the server functions with the user token and the right arguments', async () => {
    const { calls, remote } = make(() => new Response(JSON.stringify([{ entity: 'people', id: 'p', status: 'ok', row: {} }])));
    const r = await remote.push([{ entity: 'people', row: { id: 'p', name: 'Rahim' }, base_version: null }]);
    expect(r[0]!.status).toBe('ok');
    expect(calls[0]!.url).toBe('https://x.supabase.co/rest/v1/rpc/sync_push');
    expect(calls[0]!.init.headers).toMatchObject({ apikey: 'anon-key-123', authorization: 'Bearer jwt' });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ p_items: [{ entity: 'people', row: { id: 'p', name: 'Rahim' }, base_version: null }] });
    await make(() => new Response(JSON.stringify({ rows: [], cursor: 5, more: false }))).remote.pull(3, 500);
  });
  it('sends since and limit when pulling', async () => {
    const { calls, remote } = make(() => new Response(JSON.stringify({ rows: [], cursor: 5, more: false })));
    expect((await remote.pull(3, 500)).cursor).toBe(5);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ p_since: 3, p_limit: 500 });
  });
  it('fails without echoing the response body when the server errors', async () => {
    const { remote } = make(() => new Response('{"message":"duplicate key value: amount 4500"}', { status: 409 }));
    const err = await remote.push([]).catch((e: Error) => e);
    expect((err as Error).message).toBe('sync 409');
    expect((err as Error).message).not.toContain('4500');
  });
  it('does not call out when signed out', async () => {
    const { calls, remote } = make(() => new Response('[]'), null);
    await expect(remote.pull(0, 10)).rejects.toThrow('not signed in');
    expect(calls).toHaveLength(0);
  });
});
