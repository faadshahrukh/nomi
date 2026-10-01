import type { OutboxChange, OutboxItem, SyncConflict, SyncStore } from './sync/types';
import type { Account, AuditEntry, Budget, Category, Goal, Id, Person, Profile, RecurringRule, Transaction } from './types';

export class NotFoundError extends Error { constructor(what: string) { super(`${what} not found`); this.name = 'NotFoundError'; } }
export class ConflictError extends Error { constructor() { super('Record was changed elsewhere'); this.name = 'ConflictError'; } }
export class ForbiddenError extends Error { constructor() { super('Record belongs to another user'); this.name = 'ForbiddenError'; } }

/**
 * Persistence boundary. Every method takes the acting userId and must scope to it.
 * Implementations: SqlLedgerRepository (on-device SQLite), InMemoryLedgerRepository (tests, web preview),
 * and later a server-side Postgres implementation protected by row-level security.
 */
export interface LedgerRepository extends SyncStore {
  getProfile(userId: Id): Promise<Profile | null>;
  putProfile(userId: Id, profile: Profile): Promise<void>;

  listAccounts(userId: Id): Promise<Account[]>;
  putAccount(userId: Id, account: Account): Promise<void>;
  listCategories(userId: Id): Promise<Category[]>; // user's + system categories
  putCategory(userId: Id, category: Category): Promise<void>; // system categories (userId null) may be written by seeding only
  listPeople(userId: Id): Promise<Person[]>;
  putPerson(userId: Id, person: Person): Promise<void>;
  listBudgets(userId: Id): Promise<Budget[]>;
  putBudget(userId: Id, budget: Budget): Promise<void>;
  /** Budgets are plans, not ledger entries, so removing one is a real delete. A missing id is not an error. */
  deleteBudget(userId: Id, id: Id): Promise<void>;
  /** Settings that belong to this device, not the account (reminder times, sync position). Never synced. */
  getSetting(userId: Id, key: string): Promise<string | null>;
  putSetting(userId: Id, key: string, value: string): Promise<void>;
  /** Radar signals the user has dismissed. Keys are period- or item-scoped, so a dismissal never hides a different problem. */
  listDismissedSignals(userId: Id): Promise<string[]>;
  dismissSignal(userId: Id, key: string, at: string): Promise<void>;
  listRecurringRules(userId: Id): Promise<RecurringRule[]>;
  putRecurringRule(userId: Id, rule: RecurringRule): Promise<void>;
  listGoals(userId: Id): Promise<Goal[]>;
  putGoal(userId: Id, goal: Goal): Promise<void>;

  listTransactions(userId: Id, opts?: { includeDeleted?: boolean }): Promise<Transaction[]>;
  getTransaction(userId: Id, id: Id): Promise<Transaction | null>;
  insertTransaction(userId: Id, tx: Transaction): Promise<void>;
  /** Optimistic concurrency: fails with ConflictError unless stored version === expectedVersion. */
  updateTransaction(userId: Id, tx: Transaction, expectedVersion: number): Promise<void>;
  appendAudit(userId: Id, entry: AuditEntry): Promise<void>;
  listAudit(userId: Id): Promise<AuditEntry[]>;
  /** Removes everything this user has stored on this device (used by "delete my data"). System categories are kept. */
  deleteAllUserData(userId: Id): Promise<void>;

  /** Runs several writes as one unit: all happen or none do. */
  atomic<T>(work: () => Promise<T>): Promise<T>;
}

const own = <T extends { userId: Id | null }>(userId: Id, row: T) => { if (row.userId !== userId) throw new ForbiddenError(); };

function upsert<T extends { id: Id }>(list: T[], row: T) {
  const i = list.findIndex((x) => x.id === row.id);
  if (i >= 0) list[i] = { ...row }; else list.push({ ...row });
}

/** Reference implementation for tests and the web preview. Not durable. */
export class InMemoryLedgerRepository implements LedgerRepository {
  profiles: Profile[] = [];
  accounts: Account[] = []; categories: Category[] = []; people: Person[] = [];
  budgets: Budget[] = []; recurringRules: RecurringRule[] = []; goals: Goal[] = [];
  transactions: Transaction[] = []; audit: AuditEntry[] = [];

  async getProfile(userId: Id) { return this.profiles.find((p) => p.userId === userId) ?? null; }
  async putProfile(userId: Id, p: Profile) { own(userId, p); const i = this.profiles.findIndex((x) => x.userId === userId); if (i >= 0) this.profiles[i] = { ...p }; else this.profiles.push({ ...p }); }

  async listAccounts(userId: Id) { return this.accounts.filter((a) => a.userId === userId).map((a) => ({ ...a })); }
  async putAccount(userId: Id, a: Account) { own(userId, a); upsert(this.accounts, a); }
  async listCategories(userId: Id) { return this.categories.filter((c) => c.userId === userId || c.userId === null).map((c) => ({ ...c })); }
  async putCategory(userId: Id, c: Category) { if (c.userId !== null) own(userId, c); upsert(this.categories, c); }
  async listPeople(userId: Id) { return this.people.filter((p) => p.userId === userId).map((p) => ({ ...p })); }
  async putPerson(userId: Id, p: Person) { own(userId, p); upsert(this.people, p); }
  async listBudgets(userId: Id) { return this.budgets.filter((b) => b.userId === userId).map((b) => ({ ...b })); }
  async putBudget(userId: Id, b: Budget) { own(userId, b); upsert(this.budgets, b); }
  async deleteBudget(userId: Id, id: Id) { this.budgets = this.budgets.filter((b) => !(b.userId === userId && b.id === id)); }
  outbox: Array<OutboxItem & { userId: Id }> = []; conflicts: SyncConflict[] = []; private outboxSeq = 0;
  async enqueueChange(userId: Id, c: OutboxChange, now: string) {
    const cur = this.outbox.find((o) => o.userId === userId && o.entity === c.entity && o.entityId === c.entityId);
    const payload = JSON.parse(JSON.stringify(c.payload));
    if (cur) { cur.op = c.op; cur.payload = payload; cur.rev += 1; cur.attempts = 0; return; }
    this.outbox.push({ userId, seq: ++this.outboxSeq, entity: c.entity, entityId: c.entityId, op: c.op, baseVersion: c.baseVersion, payload, rev: 1, attempts: 0, createdAt: now });
  }
  async listOutbox(userId: Id, limit = 100) { return this.outbox.filter((o) => o.userId === userId).sort((a, b) => a.seq - b.seq).slice(0, limit).map(({ userId: _u, ...o }) => JSON.parse(JSON.stringify(o)) as OutboxItem); }
  async completeOutbox(userId: Id, seq: number, rev: number, serverVersion: number | null) {
    const i = this.outbox.findIndex((o) => o.userId === userId && o.seq === seq);
    if (i < 0) return;
    if (this.outbox[i]!.rev === rev) this.outbox.splice(i, 1); else { this.outbox[i]!.baseVersion = serverVersion; this.outbox[i]!.attempts = 0; }
  }
  async failOutbox(userId: Id, seq: number) { const o = this.outbox.find((x) => x.userId === userId && x.seq === seq); if (o) o.attempts += 1; }
  async dropOutbox(userId: Id, entity: OutboxItem['entity'], entityId: Id) { this.outbox = this.outbox.filter((o) => !(o.userId === userId && o.entity === entity && o.entityId === entityId)); }
  async rebaseOutbox(userId: Id, entity: OutboxItem['entity'], entityId: Id, baseVersion: number) { const o = this.outbox.find((x) => x.userId === userId && x.entity === entity && x.entityId === entityId); if (o) o.baseVersion = baseVersion; }
  async listConflicts(userId: Id) { return this.conflicts.filter((c) => c.userId === userId).map((c) => JSON.parse(JSON.stringify(c)) as SyncConflict); }
  async putConflict(userId: Id, c: SyncConflict) { await this.removeConflict(userId, c.id); this.conflicts.push(JSON.parse(JSON.stringify(c))); }
  async removeConflict(userId: Id, id: Id) { this.conflicts = this.conflicts.filter((c) => !(c.userId === userId && c.id === id)); }
  async putTransactionRaw(userId: Id, tx: Transaction) { own(userId, tx); upsert(this.transactions, tx); }
  async setTransactionVersion(userId: Id, id: Id, version: number) { const t = this.transactions.find((x) => x.userId === userId && x.id === id); if (t) t.version = version; }
  settings = new Map<string, string>();
  async getSetting(userId: Id, key: string) { return this.settings.get(`${userId}\u0000${key}`) ?? null; }
  async putSetting(userId: Id, key: string, value: string) { this.settings.set(`${userId}\u0000${key}`, value); }
  dismissed: Array<{ userId: Id; key: string; at: string }> = [];
  async listDismissedSignals(userId: Id) { return this.dismissed.filter((d) => d.userId === userId).map((d) => d.key); }
  async dismissSignal(userId: Id, key: string, at: string) { if (!this.dismissed.some((d) => d.userId === userId && d.key === key)) this.dismissed.push({ userId, key, at }); }
  async listAudit(userId: Id) { return this.audit.filter((a) => a.userId === userId).map((a) => ({ ...a })); }
  async deleteAllUserData(userId: Id) {
    this.profiles = this.profiles.filter((p) => p.userId !== userId);
    this.accounts = this.accounts.filter((a) => a.userId !== userId);
    this.categories = this.categories.filter((c) => c.userId !== userId);
    this.people = this.people.filter((p) => p.userId !== userId);
    this.budgets = this.budgets.filter((b) => b.userId !== userId);
    this.recurringRules = this.recurringRules.filter((r) => r.userId !== userId);
    this.goals = this.goals.filter((g) => g.userId !== userId);
    this.transactions = this.transactions.filter((t) => t.userId !== userId);
    this.audit = this.audit.filter((a) => a.userId !== userId);
    this.dismissed = this.dismissed.filter((d) => d.userId !== userId);
    this.outbox = this.outbox.filter((o) => o.userId !== userId);
    this.conflicts = this.conflicts.filter((c) => c.userId !== userId);
    for (const k of [...this.settings.keys()]) if (k.startsWith(`${userId}\u0000`)) this.settings.delete(k);
  }
  async listRecurringRules(userId: Id) { return this.recurringRules.filter((r) => r.userId === userId).map((r) => ({ ...r })); }
  async putRecurringRule(userId: Id, r: RecurringRule) { own(userId, r); upsert(this.recurringRules, r); }
  async listGoals(userId: Id) { return this.goals.filter((g) => g.userId === userId).map((g) => ({ ...g })); }
  async putGoal(userId: Id, g: Goal) { own(userId, g); upsert(this.goals, g); }

  async listTransactions(userId: Id, opts: { includeDeleted?: boolean } = {}) {
    return this.transactions.filter((t) => t.userId === userId && (opts.includeDeleted || !t.deletedAt)).map((t) => ({ ...t }));
  }
  async getTransaction(userId: Id, id: Id) {
    const t = this.transactions.find((x) => x.id === id && x.userId === userId);
    return t ? { ...t } : null;
  }
  async insertTransaction(userId: Id, tx: Transaction) {
    if (tx.userId !== userId) throw new ForbiddenError();
    this.transactions.push({ ...tx });
  }
  async updateTransaction(userId: Id, tx: Transaction, expectedVersion: number) {
    if (tx.userId !== userId) throw new ForbiddenError();
    const i = this.transactions.findIndex((x) => x.id === tx.id && x.userId === userId);
    if (i < 0) throw new NotFoundError('Transaction');
    if (this.transactions[i]!.version !== expectedVersion) throw new ConflictError();
    this.transactions[i] = { ...tx };
  }
  async appendAudit(userId: Id, entry: AuditEntry) {
    if (entry.userId !== userId) throw new ForbiddenError();
    this.audit.push(entry);
  }
  async atomic<T>(work: () => Promise<T>): Promise<T> { return work(); }
}
