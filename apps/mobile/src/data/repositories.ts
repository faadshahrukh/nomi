import { Platform } from 'react-native';
import {
  DEMO_USER_ID, InMemoryLedgerRepository, SqlLedgerRepository, migrate, seedDemoData, seedSystemCategories, todayIn,
  type LedgerRepository, type Profile,
} from '@nomi/core';
import { appNow } from './clock';
import { openExpoSqliteDb } from './expoSqliteDb';

/** demo: example data in its own database, labelled in the UI. real: the user's own data. The two never share a file or a user id. */
export type DataMode = 'demo' | 'real';

/** Placeholder until sign-in exists (milestone 5/6). All real data is scoped to this id on the device. */
export const LOCAL_USER_ID = 'local-user';

export const userIdFor = (mode: DataMode) => (mode === 'demo' ? DEMO_USER_ID : LOCAL_USER_ID);

export const defaultDataMode = (): DataMode =>
  process.env.EXPO_PUBLIC_DATA_MODE === 'demo' || process.env.EXPO_PUBLIC_DATA_MODE === 'real'
    ? process.env.EXPO_PUBLIC_DATA_MODE
    : __DEV__ ? 'demo' : 'real';

/** Profile used before onboarding has saved one. Not persisted. */
export function fallbackProfile(userId: string): Profile {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Dhaka';
  return { userId, country: 'BD', currency: 'BDT', timezone: tz, locale: 'mixed', confirmationPref: 'always_confirm', highImpactMinor: 1_000_000, safetyBufferMinor: 0, retainRawInput: false, defaultAccountId: null, aiProcessing: true, displayName: null };
}

const cache = new Map<DataMode, Promise<LedgerRepository>>();

/**
 * Opens (once per mode) the repository for a mode. Native uses on-device SQLite. Web has no durable store in this milestone,
 * so it uses an in-memory repository: fine for previews, and data is lost on reload.
 */
export function openRepository(mode: DataMode): Promise<LedgerRepository> {
  let p = cache.get(mode);
  if (!p) {
    p = (async () => {
      const userId = userIdFor(mode);
      let repo: LedgerRepository;
      if (Platform.OS === 'web') repo = new InMemoryLedgerRepository();
      else {
        const db = await openExpoSqliteDb(mode === 'demo' ? 'nomi-demo.db' : 'nomi.db');
        await migrate(db);
        repo = new SqlLedgerRepository(db);
      }
      await seedSystemCategories(repo, userId);
      if (mode === 'demo') await seedDemoData(repo, todayIn(fallbackProfile(userId).timezone, appNow()));
      return repo;
    })();
    p.catch(() => cache.delete(mode)); // allow a retry after a failure
    cache.set(mode, p);
  }
  return p;
}
