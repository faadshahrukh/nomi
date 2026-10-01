import type { Account, AuditEntry, Budget, Category, Goal, Id, Person, Profile, RecurringRule, Transaction } from './types';

export class NotFoundError extends Error { constructor(what: string) { super(`${what} not found`); this.name = 'NotFoundError'; } }
export class ConflictError extends Error { constructor() { super('Record was changed elsewhere'); this.name = 'ConflictError'; } }
export class ForbiddenError extends Error { constructor() { super('Record belongs to another user'); this.name = 'ForbiddenError'; } }

/**
 * Persistence boundary. Every method takes the acting userId and must scope to it.
 * Implementations: SqlLedgerRepository (on-device SQLite), InMemoryLedgerRepository (tests, web preview),
 * and later a server-side Postgres implementation protected by row-level security.
 */
export interface LedgerRepository {
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
