import { describe, expect, it } from 'vitest';
import {
  ConflictError, ForbiddenError, InMemoryLedgerRepository, MIGRATIONS, NotFoundError, TransactionService, ValidationError, accountBalances, migrate,
  type LedgerRepository,
} from '../src';
import { accounts, categories, expense, OTHER, USER } from './fixtures';
import { nodeSqlDb, sqlRepo } from './nodeSqlite';

/** The same behaviour is required of every repository implementation. */
async function seed(repo: LedgerRepository) {
  for (const a of accounts) await repo.putAccount(USER, { ...a });
  for (const c of categories) await repo.putCategory(USER, { ...c });
  await repo.putPerson(USER, { id: 'rahim', userId: USER, name: 'Rahim' });
  await repo.putPerson(USER, { id: 'karim', userId: USER, name: 'Karim' });
}

const makers: Array<[string, () => Promise<LedgerRepository>]> = [
  ['in-memory', async () => new InMemoryLedgerRepository()],
  ['sqlite', sqlRepo],
];

describe.each(makers)('%s repository contract', (_name, make) => {
  async function setup() {
    const repo = await make();
    await seed(repo);
    let n = 0;
    const svc = new TransactionService(repo, { now: () => new Date('2025-03-15T08:00:00Z'), newId: () => `id${++n}`, timezone: 'Asia/Dhaka' });
    return { repo, svc };
  }
  const balances = async (repo: LedgerRepository) => accountBalances({ accounts: await repo.listAccounts(USER), transactions: await repo.listTransactions(USER) });

  it('round-trips a full transaction including splits and nullable fields', async () => {
    const { repo, svc } = await setup();
    const t = await svc.create(USER, { type: 'expense', amountMinor: 150_000, currency: 'BDT', localDate: '2025-03-12', source: 'voice', categoryId: 'dining', accountId: null,
      paidBy: 'rahim', splits: [{ personId: 'me', amountMinor: 75_000 }, { personId: 'rahim', amountMinor: 75_000 }], merchantName: 'Dinner', notes: 'Birthday', aiConfidence: 0.93 });
    expect(await repo.getTransaction(USER, t.id)).toEqual(t);
    expect(await repo.listTransactions(USER)).toEqual([t]);
  });

  it('creates, edits and soft-deletes with balances following and an audit trail', async () => {
    const { repo, svc } = await setup();
    const t = await svc.create(USER, expense(45_000, '2025-03-15'));
    expect((await balances(repo)).get('cash')).toBe(455_000);
    await svc.update(USER, t.id, { amountMinor: 55_000, accountId: 'bank' });
    const b = await balances(repo);
    expect(b.get('cash')).toBe(500_000);
    expect(b.get('bank')).toBe(9_945_000);
    await svc.remove(USER, t.id);
    expect((await balances(repo)).get('bank')).toBe(10_000_000);
    expect(await repo.listTransactions(USER)).toHaveLength(0);
    expect(await repo.listTransactions(USER, { includeDeleted: true })).toHaveLength(1);
  });

  it('enforces optimistic concurrency and not-found', async () => {
    const { repo, svc } = await setup();
    const t = await svc.create(USER, expense(100, '2025-03-15'));
    await expect(repo.updateTransaction(USER, { ...t, amountMinor: 5 }, 99)).rejects.toBeInstanceOf(ConflictError);
    await expect(repo.updateTransaction(USER, { ...t, id: 'ghost' }, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('keeps users apart on every read and write', async () => {
    const { repo, svc } = await setup();
    const t = await svc.create(USER, expense(100, '2025-03-15'));
    expect(await repo.listTransactions(OTHER)).toEqual([]);
    expect(await repo.getTransaction(OTHER, t.id)).toBeNull();
    expect(await repo.listAccounts(OTHER)).toEqual([]);
    expect((await repo.listCategories(OTHER)).every((c) => c.userId === null)).toBe(true); // system categories only
    await expect(svc.update(OTHER, t.id, { amountMinor: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.remove(OTHER, t.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.insertTransaction(OTHER, { ...t, id: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(repo.putAccount(OTHER, accounts[0]!)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.create(OTHER, expense(100, '2025-03-15'))).rejects.toBeInstanceOf(ValidationError);
    expect((await repo.getTransaction(USER, t.id))!.amountMinor).toBe(100);
  });

  it('rolls back every write in an atomic block when one fails (SQLite only guarantees this)', async () => {
    const { repo, svc } = await setup();
    if (_name === 'in-memory') return; // the in-memory reference has no rollback
    const good = await svc.create(USER, expense(100, '2025-03-15'));
    await expect(repo.atomic(async () => {
      await repo.putPerson(USER, { id: 'temp', userId: USER, name: 'Temp' });
      await repo.insertTransaction(USER, { ...good, id: good.id }); // duplicate primary key
    })).rejects.toThrow();
    expect((await repo.listPeople(USER)).some((p) => p.id === 'temp')).toBe(false);
  });
});

describe('sqlite-specific guarantees', () => {
  it('migrates once and records the version', async () => {
    const db = nodeSqlDb();
    await migrate(db); await migrate(db);
    expect((await db.all<{ user_version: number }>('PRAGMA user_version'))[0]!.user_version).toBe(MIGRATIONS.length);
  });
  it('refuses a database from a newer app', async () => {
    const db = nodeSqlDb();
    await db.exec(`PRAGMA user_version = ${MIGRATIONS.length + 1}`);
    await expect(migrate(db)).rejects.toThrow(/newer/);
  });
  it('rejects non-positive amounts and duplicate recurring occurrences at the database level', async () => {
    const repo = await sqlRepo();
    await seed(repo);
    let n = 0;
    const svc = new TransactionService(repo, { now: () => new Date('2025-03-15T08:00:00Z'), newId: () => `id${++n}`, timezone: 'Asia/Dhaka' });
    const t = await svc.create(USER, expense(100, '2025-03-15', { recurringRuleId: 'r1', occurrenceDate: '2025-03-15' }));
    await expect(svc.create(USER, expense(100, '2025-03-15', { recurringRuleId: 'r1', occurrenceDate: '2025-03-15' }))).rejects.toThrow();
    await expect(repo.insertTransaction(USER, { ...t, id: 'z', amountMinor: 0, recurringRuleId: null })).rejects.toThrow();
    await svc.remove(USER, t.id);
    await expect(svc.create(USER, expense(100, '2025-03-15', { recurringRuleId: 'r1', occurrenceDate: '2025-03-15' }))).resolves.toBeDefined(); // a deleted one frees the slot
  });
});
