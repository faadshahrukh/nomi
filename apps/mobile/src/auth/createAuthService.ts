import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createClient } from '@supabase/supabase-js';
import { config } from '@/config';
import { chunkedStorage, type KeyValueStore } from './chunkedStorage';
import { createSupabaseAuth, notConfiguredAuth, type SupabaseLike } from './supabaseAuth';
import type { AuthService } from './types';

const secureStore: KeyValueStore = {
  getItem: (k) => SecureStore.getItemAsync(k),
  setItem: (k, v) => SecureStore.setItemAsync(k, v),
  removeItem: (k) => SecureStore.deleteItemAsync(k),
};
// Web has no secure store; the browser preview falls back to localStorage. Phones always use the keychain/keystore.
const webStore: KeyValueStore = {
  getItem: async (k) => { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } },
  setItem: async (k, v) => { try { globalThis.localStorage?.setItem(k, v); } catch { /* ignore */ } },
  removeItem: async (k) => { try { globalThis.localStorage?.removeItem(k); } catch { /* ignore */ } },
};

let cached: AuthService | null = null;

/** Builds the real service when the backend is configured, otherwise the local-only stand-in. Created once. */
export function createAuthService(): AuthService {
  if (cached) return cached;
  if (!config.backendConfigured) return (cached = notConfiguredAuth);
  WebBrowser.maybeCompleteAuthSession();
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      storage: Platform.OS === 'web' ? webStore : chunkedStorage(secureStore),
      autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce',
    },
  });
  cached = createSupabaseAuth(client as unknown as SupabaseLike, {
    redirectTo: config.authRedirect,
    openAuthSession: (url, redirectTo) => WebBrowser.openAuthSessionAsync(url, redirectTo) as ReturnType<typeof WebBrowser.openAuthSessionAsync> as never,
  });
  return cached;
}
