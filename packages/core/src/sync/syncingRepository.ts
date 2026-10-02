import type { LedgerRepository } from '../repository';
import type { Account, AuditEntry, Budget, Category, Goal, Id, Person, Profile, RecurringRule, Transaction } from '../types';
import type { OutboxChange, OutboxItem, SyncConflict } from './types';

/**
 * Wraps a repository so that every change the app makes is also queued for the server, in the same database transaction as the change
 * itself: a write and its queue entry succeed or fail together, so a crash can never leave a change that will not sync.
 * Reads pass straight through. Writes that sync applies from the server go to the wrapped repository directly, not through this.
 */
export class SyncingRepository implements LedgerRepository {
  constructor(private inner: LedgerRepository, private now: () => string = () => new Date().toISOString()) {}

  private queue(userId: Id, c: OutboxChange) { return this.inner.enqueueChange(userId, c, this.now()); }

  atomic<T>(work: () => Promise<T>) { return this.inner.atomic(work); }
  getProfile(u: Id) { return this.inner.getProfile(u); }
  async putProfile(u: Id, p: Profile) { await this.inner.atomic(async () => { await this.inner.putProfile(u, p); await this.queue(u, { entity: 'profiles', entityId: 'profile', op: 'upsert', baseVersion: null, payload: p }); }); }
  listAccounts(u: Id) { return this.inner.listAccounts(u); }
  async putAccount(u: Id, a: Account) { await this.inner.atomic(async () => { await this.inner.putAccount(u, a); await this.queue(u, { entity: 'accounts', entityId: a.id, op: 'upsert', baseVersion: null, payload: a }); }); }
  listCategories(u: Id) { return this.inner.listCategories(u); }
  async putCategory(u: Id, c: Category) {
    // Built-in categories (no owner) are seeded on every install and never synced; your own are.
    if (c.userId === null) return this.inner.putCategory(u, c);
    await this.inner.atomic(async () => { await this.inner.putCategory(u, c); await this.queue(u, { entity: 'categories', entityId: c.id, op: 'upsert', baseVersion: null, payload: c }); });
  }
  listPeople(u: Id) { return this.inner.listPeople(u); }
  async putPerson(u: Id, p: Person) { await this.inner.atomic(async () => { await this.inner.putPerson(u, p); await this.queue(u, { entity: 'people', entityId: p.id, op: 'upsert', baseVersion: null, payload: p }); }); }
  listBudgets(u: Id) { return this.inner.listBudgets(u); }
  async putBudget(u: Id, b: Budget) { await this.inner.atomic(async () => { await this.inner.putBudget(u, b); await this.queue(u, { entity: 'budgets', entityId: b.id, op: 'upsert', baseVersion: null, payload: b }); }); }
  async deleteBudget(u: Id, id: Id) {
    await this.inner.atomic(async () => {
      const existing = (await this.inner.listBudgets(u)).find((b) => b.id === id);
      await this.inner.deleteBudget(u, id);
      if (existing) await this.queue(u, { entity: 'budgets', entityId: id, op: 'delete', baseVersion: null, payload: existing });
    });
  }
  listRecurringRules(u: Id) { return this.inner.listRecurringRules(u); }
  async putRecurringRule(u: Id, r: RecurringRule) { await this.inner.atomic(async () => { await this.inner.putRecurringRule(u, r); await this.queue(u, { entity: 'recurring_rules', entityId: r.id, op: 'upsert', baseVersion: null, payload: r }); }); }
  listGoals(u: Id) { return this.inner.listGoals(u); }
  async putGoal(u: Id, g: Goal) { await this.inner.atomic(async () => { await this.inner.putGoal(u, g); await this.queue(u, { entity: 'goals', entityId: g.id, op: 'upsert', baseVersion: null, payload: g }); }); }

  listTransactions(u: Id, o?: { includeDeleted?: boolean }) { return this.inner.listTransactions(u, o); }
  getTransaction(u: Id, id: Id) { return this.inner.getTransaction(u, id); }
  async insertTransaction(u: Id, tx: Transaction) { await this.inner.atomic(async () => { await this.inner.insertTransaction(u, tx); await this.queue(u, { entity: 'transactions', entityId: tx.id, op: 'upsert', baseVersion: null, payload: tx }); }); }
  async updateTransaction(u: Id, tx: Transaction, expectedVersion: number) {
    await this.inner.atomic(async () => { await this.inner.updateTransaction(u, tx, expectedVersion); await this.queue(u, { entity: 'transactions', entityId: tx.id, op: 'upsert', baseVersion: expectedVersion, payload: tx }); });
  }
  appendAudit(u: Id, e: AuditEntry) { return this.inner.appendAudit(u, e); }
  listAudit(u: Id) { return this.inner.listAudit(u); }
  deleteAllUserData(u: Id) { return this.inner.deleteAllUserData(u); }
  getSetting(u: Id, k: string) { return this.inner.getSetting(u, k); }
  putSetting(u: Id, k: string, v: string) { return this.inner.putSetting(u, k, v); }
  listDismissedSignals(u: Id) { return this.inner.listDismissedSignals(u); }
  dismissSignal(u: Id, k: string, at: string) { return this.inner.dismissSignal(u, k, at); }

  enqueueChange(u: Id, c: OutboxChange, now: string) { return this.inner.enqueueChange(u, c, now); }
  listOutbox(u: Id, l?: number): Promise<OutboxItem[]> { return this.inner.listOutbox(u, l); }
  completeOutbox(u: Id, seq: number, rev: number, v: number | null) { return this.inner.completeOutbox(u, seq, rev, v); }
  failOutbox(u: Id, seq: number) { return this.inner.failOutbox(u, seq); }
  dropOutbox(u: Id, e: OutboxItem['entity'], id: Id) { return this.inner.dropOutbox(u, e, id); }
  rebaseOutbox(u: Id, e: OutboxItem['entity'], id: Id, v: number) { return this.inner.rebaseOutbox(u, e, id, v); }
  listConflicts(u: Id): Promise<SyncConflict[]> { return this.inner.listConflicts(u); }
  putConflict(u: Id, c: SyncConflict) { return this.inner.putConflict(u, c); }
  removeConflict(u: Id, id: Id) { return this.inner.removeConflict(u, id); }
  putTransactionRaw(u: Id, tx: Transaction) { return this.inner.putTransactionRaw(u, tx); }
  setTransactionVersion(u: Id, id: Id, v: number) { return this.inner.setTransactionVersion(u, id, v); }
}
