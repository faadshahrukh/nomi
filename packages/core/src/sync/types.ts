import type { Id, Transaction } from '../types';

export type SyncEntity = 'profiles' | 'accounts' | 'people' | 'goals' | 'recurring_rules' | 'budgets' | 'transactions';
export const SYNC_ENTITIES: SyncEntity[] = ['profiles', 'accounts', 'people', 'goals', 'recurring_rules', 'budgets', 'transactions'];

/** One local change waiting to be sent. Several edits of the same record collapse into one item, with `rev` counting them. */
export interface OutboxItem {
  seq: number; entity: SyncEntity; entityId: Id; op: 'upsert' | 'delete';
  /** Transactions only: the server version this change was made on top of. Null means "new". */
  baseVersion: number | null;
  /** The record as the app sees it (not the wire format). */
  payload: unknown;
  rev: number; attempts: number; createdAt: string;
}

export interface OutboxChange { entity: SyncEntity; entityId: Id; op: 'upsert' | 'delete'; baseVersion: number | null; payload: unknown }

/** Two versions of one transaction that were changed on two devices in ways that cannot be merged automatically. */
export interface SyncConflict { id: Id; userId: Id; local: Transaction; remote: Transaction; createdAt: string }

/** Local bookkeeping for sync. Part of the repository so it commits in the same database transaction as the change it records. */
export interface SyncStore {
  /** Queues a change. If the record already has one waiting it is replaced by the newer one, keeping the original base version. */
  enqueueChange(userId: Id, change: OutboxChange, now: string): Promise<void>;
  listOutbox(userId: Id, limit?: number): Promise<OutboxItem[]>;
  /** The server accepted `seq` as sent at `rev`. Removes it, unless the record was edited again meanwhile, in which case the newer edit stays, rebased on `serverVersion`. */
  completeOutbox(userId: Id, seq: number, rev: number, serverVersion: number | null): Promise<void>;
  /** The server refused it. It stays queued and is counted, so the app can say "N changes could not be sent". */
  failOutbox(userId: Id, seq: number): Promise<void>;
  /** Forgets any queued change for this record (its fate was decided another way, for example a conflict). */
  dropOutbox(userId: Id, entity: SyncEntity, entityId: Id): Promise<void>;
  /** Points a queued change at a new base version. */
  rebaseOutbox(userId: Id, entity: SyncEntity, entityId: Id, baseVersion: number): Promise<void>;
  listConflicts(userId: Id): Promise<SyncConflict[]>;
  putConflict(userId: Id, conflict: SyncConflict): Promise<void>;
  removeConflict(userId: Id, id: Id): Promise<void>;
  /** Writes a transaction exactly as given, bypassing the version check. Used only to apply what the server sent. */
  putTransactionRaw(userId: Id, tx: Transaction): Promise<void>;
  setTransactionVersion(userId: Id, id: Id, version: number): Promise<void>;
}

/** The wire shape: rows as the server stores them (snake_case). */
export interface PushItem { entity: SyncEntity; row: Record<string, unknown>; base_version: number | null }
export type PushResult =
  | { entity: SyncEntity; id: string; status: 'ok'; row: Record<string, unknown> }
  | { entity: SyncEntity; id: string; status: 'conflict'; row: Record<string, unknown> }
  | { entity: SyncEntity; id: string; status: 'rejected'; message?: string };
export interface PullPage { rows: Array<{ entity: SyncEntity; row: Record<string, unknown> }>; cursor: number; more: boolean }

/** The server, as the engine sees it. Implemented over HTTP in the app and over a real Postgres in the tests. */
export interface SyncRemote {
  push(items: PushItem[]): Promise<PushResult[]>;
  pull(since: number, limit: number): Promise<PullPage>;
}
