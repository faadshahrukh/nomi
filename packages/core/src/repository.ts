import type { Account, AuditEntry, Category, Id, Person, Transaction } from './types';

export class NotFoundError extends Error { constructor(what: string) { super(`${what} not found`); this.name = 'NotFoundError'; } }
export class ConflictError extends Error { constructor() { super('Record was changed elsewhere'); this.name = 'ConflictError'; } }
export class ForbiddenError extends Error { constructor() { super('Record belongs to another user'); this.name = 'ForbiddenError'; } }

/**
 * Persistence boundary. Every method takes the acting userId and must scope to it.
 * Production implementations: on-device SQLite (offline) and Postgres with row-level security.
 */
export interface LedgerRepository {
  listAccounts(userId: Id): Promise<Account[]>;
  listCategories(userId: Id): Promise<Category[]>; // user's + system categories
  listPeople(userId: Id): Promise<Person[]>;
  listTransactions(userId: Id, opts?: { includeDeleted?: boolean }): Promise<Transaction[]>;
  getTransaction(userId: Id, id: Id): Promise<Transaction | null>;
  insertTransaction(userId: Id, tx: Transaction): Promise<void>;
  /** Optimistic concurrency: fails with ConflictError unless stored version === expectedVersion. */
  updateTransaction(userId: Id, tx: Transaction, expectedVersion: number): Promise<void>;
  appendAudit(userId: Id, entry: AuditEntry): Promise<void>;
}

/** Reference implementation for tests and local development. */
export class InMemoryLedgerRepository implements LedgerRepository {
  accounts: Account[] = []; categories: Category[] = []; people: Person[] = [];
  transactions: Transaction[] = []; audit: AuditEntry[] = [];

  async listAccounts(userId: Id) { return this.accounts.filter((a) => a.userId === userId); }
  async listCategories(userId: Id) { return this.categories.filter((c) => c.userId === userId || c.userId === null); }
  async listPeople(userId: Id) { return this.people.filter((p) => p.userId === userId); }
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
}
