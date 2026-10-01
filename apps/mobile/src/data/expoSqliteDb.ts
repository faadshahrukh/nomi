import * as SQLite from 'expo-sqlite';
import type { SqlDb, SqlValue } from '@nomi/core';

/**
 * Adapts expo-sqlite to the core's SqlDb. Native only (iOS, Android).
 * Note: expo-sqlite's withTransactionAsync is not exclusive, so writes must be awaited in sequence, which the repository does.
 */
export async function openExpoSqliteDb(name: string): Promise<SqlDb> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  let depth = 0;
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlValue[] = []) => ({ changes: (await db.runAsync(sql, params)).changes }),
    all: <T,>(sql: string, params: SqlValue[] = []) => db.getAllAsync<T>(sql, params),
    async transaction<T>(work: () => Promise<T>): Promise<T> {
      if (depth > 0) return work(); // already inside a transaction
      let out!: T;
      depth++;
      try { await db.withTransactionAsync(async () => { out = await work(); }); } finally { depth--; }
      return out;
    },
  };
}
