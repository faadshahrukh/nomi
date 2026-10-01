/**
 * The smallest database surface the repository needs. expo-sqlite (on device) and node:sqlite (tests)
 * both satisfy it through thin adapters, so the SQL and migrations are identical everywhere.
 */
export type SqlValue = string | number | null;

export interface SqlDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Runs `work` inside a transaction; rolls back if it throws. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}
