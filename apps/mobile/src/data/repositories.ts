import { Platform } from 'react-native';
import {
  DEMO_USER_ID, InMemoryLedgerRepository, SqlLedgerRepository, SyncingRepository, buildProfile, migrate, regionForTimezone, seedDemoData, seedSystemCategories, todayIn,
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

/** Profile used before onboarding has saved one: the device's own region and timezone. Not persisted. */
export function fallbackProfile(userId: string): Profile {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Dhaka';
  return buildProfile(userId, regionForTimezone(tz), { timezone: tz });
}

const cache = new Map<DataMode, Promise<LedgerRepository>>();
const wrapped = new Map<DataMode, LedgerRepository>();

/**
 * The plain repository for a mode. Sync works on this one: what it applies from the server must not be queued to be sent back.
 * Native uses on-device SQLite. Web has no durable store in this milestone, so it uses an in-memory repository: fine for previews,
 * and data is lost on reload.
 */
export function openRawRepository(mode: DataMode): Promise<LedgerRepository> {
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

/**
 * The repository the app writes through. For the user's own data every write is also queued for the server (so signing in later, or
 * working offline, loses nothing). Example data is never queued.
 */
export async function openRepository(mode: DataMode): Promise<LedgerRepository> {
  const raw = await openRawRepository(mode);
  if (mode === 'demo') return raw;
  let w = wrapped.get(mode);
  if (!w) { w = new SyncingRepository(raw); wrapped.set(mode, w); }
  return w;
}
