import { ConflictError, ForbiddenError, NotFoundError, type LedgerRepository } from '../repository';
import type { Account, AuditEntry, Budget, Category, Goal, Id, Person, Profile, RecurringRule, Transaction } from '../types';
import type { SqlDb, SqlValue } from './db';

type Row = Record<string, SqlValue>;
const s = (v: SqlValue): string => String(v);
const sn = (v: SqlValue): string | null => (v === null || v === undefined ? null : String(v));
const n = (v: SqlValue): number => Number(v);
const nn = (v: SqlValue): number | null => (v === null || v === undefined ? null : Number(v));
const b = (v: SqlValue): boolean => Number(v) === 1;
const own = (userId: Id, rowUser: Id | null) => { if (rowUser !== userId) throw new ForbiddenError(); };

const toTx = (r: Row): Transaction => ({
  id: s(r.id!), userId: s(r.user_id!), type: s(r.type!) as Transaction['type'], amountMinor: n(r.amount_minor!), currency: s(r.currency!),
  categoryId: sn(r.category_id!), merchantName: sn(r.merchant_name!), accountId: sn(r.account_id!), toAccountId: sn(r.to_account_id!),
  localDate: s(r.local_date!), localTime: sn(r.local_time!), notes: sn(r.notes!), paidBy: s(r.paid_by!),
  splits: r.splits ? JSON.parse(s(r.splits)) : null, counterpartyId: sn(r.counterparty_id!),
  debtDirection: sn(r.debt_direction!) as Transaction['debtDirection'], repaymentDirection: sn(r.repayment_direction!) as Transaction['repaymentDirection'],
  goalId: sn(r.goal_id!), recurringRuleId: sn(r.recurring_rule_id!), occurrenceDate: sn(r.occurrence_date!),
  source: s(r.source!) as Transaction['source'], aiConfidence: nn(r.ai_confidence!), rawInput: sn(r.raw_input!),
  createdAt: s(r.created_at!), updatedAt: s(r.updated_at!), deletedAt: sn(r.deleted_at!), version: n(r.version!),
});

const TX_COLS = ['id', 'user_id', 'type', 'amount_minor', 'currency', 'category_id', 'merchant_name', 'account_id', 'to_account_id', 'local_date', 'local_time', 'notes',
  'paid_by', 'splits', 'counterparty_id', 'debt_direction', 'repayment_direction', 'goal_id', 'recurring_rule_id', 'occurrence_date', 'source', 'ai_confidence',
  'raw_input', 'created_at', 'updated_at', 'deleted_at', 'version'] as const;

const txParams = (t: Transaction): SqlValue[] => [
  t.id, t.userId, t.type, t.amountMinor, t.currency, t.categoryId, t.merchantName, t.accountId, t.toAccountId, t.localDate, t.localTime, t.notes,
  t.paidBy, t.splits ? JSON.stringify(t.splits) : null, t.counterpartyId, t.debtDirection, t.repaymentDirection, t.goalId, t.recurringRuleId, t.occurrenceDate,
  t.source, t.aiConfidence, t.rawInput, t.createdAt, t.updatedAt, t.deletedAt, t.version,
];

/** SQLite-backed repository. Every query is scoped by user_id; callers can never read or write another user's rows. */
export class SqlLedgerRepository implements LedgerRepository {
  constructor(private db: SqlDb) {}

  atomic<T>(work: () => Promise<T>): Promise<T> { return this.db.transaction(work); }

  async getProfile(userId: Id): Promise<Profile | null> {
    const [r] = await this.db.all<Row>('SELECT * FROM profiles WHERE user_id = ?', [userId]);
    return r ? { userId: s(r.user_id!), country: s(r.country!), currency: s(r.currency!), timezone: s(r.timezone!), locale: s(r.locale!) as Profile['locale'],
      confirmationPref: s(r.confirmation_pref!) as Profile['confirmationPref'], highImpactMinor: n(r.high_impact_minor!), safetyBufferMinor: n(r.safety_buffer_minor!),
      retainRawInput: b(r.retain_raw_input!), defaultAccountId: sn(r.default_account_id!), aiProcessing: b(r.ai_processing!), displayName: sn(r.display_name!), primaryGoals: JSON.parse(s(r.primary_goals ?? '[]')), onboardedAt: sn(r.onboarded_at!) } : null;
  }
  async putProfile(userId: Id, p: Profile) {
    own(userId, p.userId);
    await this.db.run(`INSERT OR REPLACE INTO profiles (user_id, country, currency, timezone, locale, confirmation_pref, high_impact_minor, safety_buffer_minor, retain_raw_input, default_account_id, ai_processing, display_name, primary_goals, onboarded_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [p.userId, p.country, p.currency, p.timezone, p.locale, p.confirmationPref, p.highImpactMinor, p.safetyBufferMinor, p.retainRawInput ? 1 : 0, p.defaultAccountId, p.aiProcessing ? 1 : 0, p.displayName, JSON.stringify(p.primaryGoals), p.onboardedAt]);
  }

  async listAccounts(userId: Id): Promise<Account[]> {
    return (await this.db.all<Row>('SELECT * FROM accounts WHERE user_id = ? ORDER BY name', [userId])).map((r) => ({
      id: s(r.id!), userId: s(r.user_id!), name: s(r.name!), type: s(r.type!) as Account['type'], currency: s(r.currency!), aliases: JSON.parse(s(r.aliases!)),
      openingBalanceMinor: n(r.opening_balance_minor!), includeInLiquid: b(r.include_in_liquid!), archivedAt: sn(r.archived_at!) }));
  }
  async putAccount(userId: Id, a: Account) {
    own(userId, a.userId);
    await this.db.run(`INSERT OR REPLACE INTO accounts (id, user_id, name, type, currency, aliases, opening_balance_minor, include_in_liquid, archived_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [a.id, a.userId, a.name, a.type, a.currency, JSON.stringify(a.aliases), a.openingBalanceMinor, a.includeInLiquid ? 1 : 0, a.archivedAt]);
  }

  async listCategories(userId: Id): Promise<Category[]> {
    return (await this.db.all<Row>('SELECT * FROM categories WHERE user_id = ? OR user_id IS NULL ORDER BY name', [userId])).map((r) => ({
      id: s(r.id!), userId: sn(r.user_id!), parentId: sn(r.parent_id!), name: s(r.name!), kind: s(r.kind!) as Category['kind'], archivedAt: sn(r.archived_at!) }));
  }
  async putCategory(userId: Id, c: Category) {
    if (c.userId !== null) own(userId, c.userId);
    await this.db.run(`INSERT OR REPLACE INTO categories (id, user_id, parent_id, name, kind, archived_at) VALUES (?,?,?,?,?,?)`, [c.id, c.userId, c.parentId, c.name, c.kind, c.archivedAt]);
  }

  async listPeople(userId: Id): Promise<Person[]> {
    return (await this.db.all<Row>('SELECT * FROM people WHERE user_id = ? ORDER BY name', [userId])).map((r) => ({ id: s(r.id!), userId: s(r.user_id!), name: s(r.name!) }));
  }
  async putPerson(userId: Id, p: Person) {
    own(userId, p.userId);
    await this.db.run('INSERT OR REPLACE INTO people (id, user_id, name) VALUES (?,?,?)', [p.id, p.userId, p.name]);
  }

  async listBudgets(userId: Id): Promise<Budget[]> {
    return (await this.db.all<Row>('SELECT * FROM budgets WHERE user_id = ?', [userId])).map((r) => ({
      id: s(r.id!), userId: s(r.user_id!), categoryId: sn(r.category_id!), amountMinor: n(r.amount_minor!), currency: s(r.currency!) }));
  }
  async putBudget(userId: Id, x: Budget) {
    own(userId, x.userId);
    await this.db.run('INSERT OR REPLACE INTO budgets (id, user_id, category_id, amount_minor, currency) VALUES (?,?,?,?,?)', [x.id, x.userId, x.categoryId, x.amountMinor, x.currency]);
  }

  async deleteBudget(userId: Id, id: Id) { await this.db.run('DELETE FROM budgets WHERE user_id = ? AND id = ?', [userId, id]); }

  async listAudit(userId: Id): Promise<AuditEntry[]> {
    return (await this.db.all<Row>('SELECT * FROM audit_log WHERE user_id = ? ORDER BY at, id', [userId])).map((r) => ({
      id: s(r.id!), userId: s(r.user_id!), entity: 'transaction', entityId: s(r.entity_id!), action: s(r.action!) as AuditEntry['action'], at: s(r.at!),
      changedFields: JSON.parse(s(r.changed_fields!)) as string[], before: r.before_json ? JSON.parse(s(r.before_json)) : null, after: r.after_json ? JSON.parse(s(r.after_json)) : null }));
  }
  async deleteAllUserData(userId: Id) {
    await this.db.transaction(async () => {
      for (const t of ['transactions', 'audit_log', 'budgets', 'recurring_rules', 'goals', 'people', 'accounts', 'profiles', 'dismissed_signals', 'settings']) await this.db.run(`DELETE FROM ${t} WHERE user_id = ?`, [userId]);
      await this.db.run('DELETE FROM categories WHERE user_id = ?', [userId]);
    });
  }
  async getSetting(userId: Id, key: string): Promise<string | null> {
    const [r] = await this.db.all<Row>('SELECT value FROM settings WHERE user_id = ? AND key = ?', [userId, key]);
    return r ? s(r.value!) : null;
  }
  async putSetting(userId: Id, key: string, value: string) { await this.db.run('INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?,?,?)', [userId, key, value]); }
  async listDismissedSignals(userId: Id): Promise<string[]> { return (await this.db.all<Row>('SELECT key FROM dismissed_signals WHERE user_id = ?', [userId])).map((r) => s(r.key!)); }
  async dismissSignal(userId: Id, key: string, at: string) { await this.db.run('INSERT OR IGNORE INTO dismissed_signals (user_id, key, at) VALUES (?,?,?)', [userId, key, at]); }

  async listRecurringRules(userId: Id): Promise<RecurringRule[]> {
    return (await this.db.all<Row>('SELECT * FROM recurring_rules WHERE user_id = ?', [userId])).map((r) => ({
      id: s(r.id!), userId: s(r.user_id!), name: s(r.name!), type: s(r.type!) as RecurringRule['type'], amountMinor: n(r.amount_minor!), currency: s(r.currency!),
      accountId: s(r.account_id!), categoryId: sn(r.category_id!), frequency: s(r.frequency!) as RecurringRule['frequency'], interval: n(r.interval_n!),
      anchorDate: s(r.anchor_date!), endDate: sn(r.end_date!), isBill: b(r.is_bill!), active: b(r.active!) }));
  }
  async putRecurringRule(userId: Id, x: RecurringRule) {
    own(userId, x.userId);
    await this.db.run(`INSERT OR REPLACE INTO recurring_rules (id, user_id, name, type, amount_minor, currency, account_id, category_id, frequency, interval_n, anchor_date, end_date, is_bill, active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [x.id, x.userId, x.name, x.type, x.amountMinor, x.currency, x.accountId, x.categoryId, x.frequency, x.interval, x.anchorDate, x.endDate, x.isBill ? 1 : 0, x.active ? 1 : 0]);
  }

  async listGoals(userId: Id): Promise<Goal[]> {
    return (await this.db.all<Row>('SELECT * FROM goals WHERE user_id = ?', [userId])).map((r) => ({
      id: s(r.id!), userId: s(r.user_id!), name: s(r.name!), currency: s(r.currency!), targetMinor: n(r.target_minor!), targetDate: sn(r.target_date!),
      monthlyContributionMinor: nn(r.monthly_contribution_minor!), openingSavedMinor: n(r.opening_saved_minor!) }));
  }
  async putGoal(userId: Id, g: Goal) {
    own(userId, g.userId);
    await this.db.run(`INSERT OR REPLACE INTO goals (id, user_id, name, currency, target_minor, target_date, monthly_contribution_minor, opening_saved_minor) VALUES (?,?,?,?,?,?,?,?)`,
      [g.id, g.userId, g.name, g.currency, g.targetMinor, g.targetDate, g.monthlyContributionMinor, g.openingSavedMinor]);
  }

  async listTransactions(userId: Id, opts: { includeDeleted?: boolean } = {}): Promise<Transaction[]> {
    const sql = `SELECT * FROM transactions WHERE user_id = ?${opts.includeDeleted ? '' : ' AND deleted_at IS NULL'} ORDER BY local_date, created_at, id`;
    return (await this.db.all<Row>(sql, [userId])).map(toTx);
  }
  async getTransaction(userId: Id, id: Id): Promise<Transaction | null> {
    const [r] = await this.db.all<Row>('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [id, userId]);
    return r ? toTx(r) : null;
  }
  async insertTransaction(userId: Id, tx: Transaction) {
    own(userId, tx.userId);
    await this.db.run(`INSERT INTO transactions (${TX_COLS.join(', ')}) VALUES (${TX_COLS.map(() => '?').join(',')})`, txParams(tx));
  }
  async updateTransaction(userId: Id, tx: Transaction, expectedVersion: number) {
    own(userId, tx.userId);
    const sets = TX_COLS.filter((c) => c !== 'id' && c !== 'user_id').map((c) => `${c} = ?`).join(', ');
    const params = txParams(tx).slice(2);
    const { changes } = await this.db.run(`UPDATE transactions SET ${sets} WHERE id = ? AND user_id = ? AND version = ?`, [...params, tx.id, userId, expectedVersion]);
    if (changes === 0) {
      const exists = await this.getTransaction(userId, tx.id);
      throw exists ? new ConflictError() : new NotFoundError('Transaction');
    }
  }

  async appendAudit(userId: Id, e: AuditEntry) {
    own(userId, e.userId);
    await this.db.run('INSERT INTO audit_log (id, user_id, entity, entity_id, action, at, changed_fields, before_json, after_json) VALUES (?,?,?,?,?,?,?,?,?)',
      [e.id, e.userId, e.entity, e.entityId, e.action, e.at, JSON.stringify(e.changedFields), e.before ? JSON.stringify(e.before) : null, e.after ? JSON.stringify(e.after) : null]);
  }
}
