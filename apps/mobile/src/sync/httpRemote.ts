import type { PullPage, PushItem, PushResult, SyncRemote } from '@nomi/core';

export interface HttpRemoteOptions { url: string; anonKey: string; getToken: () => Promise<string | null>; fetchFn?: typeof fetch }

/**
 * The server's sync functions over HTTP (Supabase's RPC endpoint). The user's own access token goes with every call, so the
 * database's row-level security decides what is visible, exactly as it does for any other request. Failures carry no body or
 * message: those can quote the values that were sent.
 */
export function createHttpRemote(o: HttpRemoteOptions): SyncRemote {
  const f = o.fetchFn ?? fetch;
  async function rpc<T>(name: string, body: unknown): Promise<T> {
    const token = await o.getToken();
    if (!token) throw new Error('not signed in');
    const res = await f(`${o.url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: o.anonKey, authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`sync ${res.status}`);
    return (await res.json()) as T;
  }
  return {
    push: (items: PushItem[]) => rpc<PushResult[]>('sync_push', { p_items: items }),
    pull: (since: number, limit: number) => rpc<PullPage>('sync_pull', { p_since: since, p_limit: limit }),
  };
}
