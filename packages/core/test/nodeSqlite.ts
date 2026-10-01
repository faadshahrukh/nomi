import { createRequire } from 'node:module';
import { migrate, SqlLedgerRepository, type SqlDb, type SqlValue } from '../src';

// Vite's resolver doesn't know node:sqlite yet, so load it through plain Node require.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => any };

/** Adapts node's built-in SQLite to SqlDb so the exact production SQL and migrations run under test. */
export function nodeSqlDb(): SqlDb {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    async exec(sql) { db.exec(sql); },
    async run(sql, params: SqlValue[] = []) { const r = db.prepare(sql).run(...params); return { changes: Number(r.changes) }; },
    async all<T>(sql: string, params: SqlValue[] = []) { return db.prepare(sql).all(...params) as T[]; },
    async transaction<T>(work: () => Promise<T>) {
      if (depth > 0) return work();
      depth++; db.exec('BEGIN');
      try { const r = await work(); db.exec('COMMIT'); return r; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      finally { depth--; }
    },
  };
}

export async function sqlRepo(): Promise<SqlLedgerRepository> {
  const db = nodeSqlDb();
  await migrate(db);
  return new SqlLedgerRepository(db);
}
export { nodeSqlDb as rawDb };
