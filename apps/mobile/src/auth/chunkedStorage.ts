/** Minimal async key-value store (expo-secure-store on a phone). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Secure stores such as the iOS Keychain limit a value to about 2 KB, but a session (access token, refresh token, user) is larger.
 * This splits a value across numbered keys and reassembles it, so the session can live in secure storage instead of plain storage.
 */
export function chunkedStorage(inner: KeyValueStore, chunkSize = 1800): KeyValueStore {
  const countKey = (k: string) => `${k}.n`;
  const chunkKey = (k: string, i: number) => `${k}.${i}`;
  const clear = async (key: string) => {
    const n = Number((await inner.getItem(countKey(key))) ?? 0);
    for (let i = 0; i < n; i++) await inner.removeItem(chunkKey(key, i));
    await inner.removeItem(countKey(key));
  };
  return {
    async getItem(key) {
      const n = Number((await inner.getItem(countKey(key))) ?? 0);
      if (!n) return null;
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const part = await inner.getItem(chunkKey(key, i));
        if (part === null) return null; // a partial write is treated as no session, never as a corrupt one
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      await clear(key);
      const n = Math.ceil(value.length / chunkSize);
      for (let i = 0; i < n; i++) await inner.setItem(chunkKey(key, i), value.slice(i * chunkSize, (i + 1) * chunkSize));
      await inner.setItem(countKey(key), String(n));
    },
    removeItem: clear,
  };
}
