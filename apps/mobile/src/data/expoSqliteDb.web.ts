import type { SqlDb } from '@nomi/core';

/** Web has no durable store in this milestone (repositories.ts uses the in-memory repository there), so SQLite is never opened. */
export async function openExpoSqliteDb(_name: string): Promise<SqlDb> {
  throw new Error('SQLite is not available on web');
}
