import { todayIn } from './dates';
import { validateTransaction, type Issue } from './ledger';
import { NotFoundError, type LedgerRepository } from './repository';
import type { AuditEntry, Id, LedgerData, Transaction } from './types';

export class ValidationError extends Error {
  constructor(public issues: Issue[]) { super(`Invalid transaction: ${issues.map((i) => i.code).join(', ')}`); this.name = 'ValidationError'; }
}

/** Fields a caller supplies. Everything else (ids, timestamps, version) is set by the service. */
export type TransactionInput = Pick<Transaction, 'type' | 'amountMinor' | 'currency' | 'localDate' | 'source'> &
  Partial<Omit<Transaction, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version'>>;

export interface ServiceOptions {
  now: () => Date; newId: () => Id; timezone: string;
  /** Privacy default: raw user text/transcripts are NOT stored unless the user opts in. */
  retainRawInput?: boolean;
}

/** Orchestrates validate -> persist -> audit. Balances are never stored; they are derived from transactions. */
export class TransactionService {
  constructor(private repo: LedgerRepository, private opts: ServiceOptions) {}

  private async load(userId: Id): Promise<LedgerData> {
    const [accounts, categories, people, transactions] = await Promise.all([
      this.repo.listAccounts(userId), this.repo.listCategories(userId),
      this.repo.listPeople(userId), this.repo.listTransactions(userId),
    ]);
    return { accounts, categories, people, transactions };
  }

  private audit(userId: Id, entityId: Id, action: AuditEntry['action'], before: Transaction | null, after: Transaction | null): AuditEntry {
    const keys = (Object.keys(after ?? before ?? {}) as Array<keyof Transaction>).filter((k) => k !== 'updatedAt' && k !== 'version');
    const changed = keys.filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
    return { id: this.opts.newId(), userId, entity: 'transaction', entityId, action, at: this.opts.now().toISOString(), changedFields: changed, before, after };
  }

  async create(userId: Id, input: TransactionInput): Promise<Transaction> {
    const nowIso = this.opts.now().toISOString();
    const tx: Transaction = {
      categoryId: null, merchantName: null, accountId: null, toAccountId: null, localTime: null, notes: null,
      paidBy: 'me', splits: null, counterpartyId: null, debtDirection: null, repaymentDirection: null,
      goalId: null, recurringRuleId: null, occurrenceDate: null, aiConfidence: null, rawInput: null,
      ...input,
      id: this.opts.newId(), userId, createdAt: nowIso, updatedAt: nowIso, deletedAt: null, version: 1,
    };
    if (!this.opts.retainRawInput) tx.rawInput = null;
    const issues = validateTransaction(tx, await this.load(userId));
    if (issues.length) throw new ValidationError(issues);
    await this.repo.insertTransaction(userId, tx);
    await this.repo.appendAudit(userId, this.audit(userId, tx.id, 'create', null, tx));
    return tx;
  }

  /** Field-level correction: merges `patch` into the stored transaction and revalidates the whole result. */
  async update(userId: Id, id: Id, patch: Partial<TransactionInput>): Promise<Transaction> {
    const before = await this.repo.getTransaction(userId, id);
    if (!before || before.deletedAt) throw new NotFoundError('Transaction');
    const after: Transaction = { ...before, ...patch, id, userId, createdAt: before.createdAt, deletedAt: null,
      updatedAt: this.opts.now().toISOString(), version: before.version + 1 };
    if (!this.opts.retainRawInput) after.rawInput = null;
    const data = await this.load(userId);
    const issues = validateTransaction(after, { ...data, transactions: data.transactions.filter((t) => t.id !== id) });
    if (issues.length) throw new ValidationError(issues);
    await this.repo.updateTransaction(userId, after, before.version);
    await this.repo.appendAudit(userId, this.audit(userId, id, 'update', before, after));
    return after;
  }

  /** Soft delete so the audit trail and sync stay consistent. */
  async remove(userId: Id, id: Id): Promise<void> {
    const before = await this.repo.getTransaction(userId, id);
    if (!before || before.deletedAt) throw new NotFoundError('Transaction');
    const after: Transaction = { ...before, deletedAt: this.opts.now().toISOString(), updatedAt: this.opts.now().toISOString(), version: before.version + 1 };
    await this.repo.updateTransaction(userId, after, before.version);
    await this.repo.appendAudit(userId, this.audit(userId, id, 'delete', before, after));
  }

  /** Brings back a deleted transaction (the Undo after a delete). Validated again, since the ledger may have changed meanwhile. */
  async restore(userId: Id, id: Id): Promise<Transaction> {
    const before = await this.repo.getTransaction(userId, id);
    if (!before) throw new NotFoundError('Transaction');
    if (!before.deletedAt) return before;
    const after: Transaction = { ...before, deletedAt: null, updatedAt: this.opts.now().toISOString(), version: before.version + 1 };
    const data = await this.load(userId);
    const issues = validateTransaction(after, { ...data, transactions: data.transactions.filter((t) => t.id !== id) });
    if (issues.length) throw new ValidationError(issues);
    await this.repo.updateTransaction(userId, after, before.version);
    await this.repo.appendAudit(userId, this.audit(userId, id, 'update', before, after));
    return after;
  }

  today(): string { return todayIn(this.opts.timezone, this.opts.now()); }
}
