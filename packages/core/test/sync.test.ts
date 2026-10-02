import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  InMemoryLedgerRepository, SyncingRepository, TransactionService, fromServerRow, resolveTransactionConflict, runSync, toServerRow,
  type LedgerRepository, type PushItem, type PushResult, type PullPage, type SyncRemote, type Transaction,
} from '../src';
import { DEFAULT_CATEGORIES } from '../src';
import { accounts, expense } from './fixtures';
import { sqlRepo } from './nodeSqlite';

const MIGRATIONS_DIR = new URL('../../../supabase/migrations/', import.meta.url);
const BOOTSTRAP = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;
const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222';
const LOCAL = 'local-user';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BOOTSTRAP);
  for (const f of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'));
}, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec('delete from auth.users');
  await db.exec(`insert into auth.users (id) values ('${ACCOUNT_A}'), ('${ACCOUNT_B}')`);
});

/** The real server logic (the migrations' sync_push and sync_pull on Postgres), called as a signed-in user. */
class PgRemote implements SyncRemote {
  constructor(private uid: string, public log: Array<{ items: number }> = []) {}
  private async as<T>(fn: () => Promise<T>): Promise<T> {
    await db.exec('set role authenticated'); await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [this.uid]);
    try { return await fn(); } finally { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub', '', false)`); }
  }
  push(items: PushItem[]) { this.log.push({ items: items.length }); return this.as(async () => (await db.query<{ r: PushResult[] }>('select public.sync_push($1::jsonb) as r', [JSON.stringify(items)])).rows[0]!.r); }
  pull(since: number, limit: number) { return this.as(async () => (await db.query<{ r: PullPage }>('select public.sync_pull($1, $2) as r', [since, limit])).rows[0]!.r); }
}

const profile = { userId: LOCAL, country: 'BD', currency: 'BDT' as const, timezone: 'Asia/Dhaka', locale: 'en' as const, confirmationPref: 'always_confirm' as const, highImpactMinor: 1_000_000,
  safetyBufferMinor: 0, retainRawInput: false, defaultAccountId: 'cash', aiProcessing: true, displayName: 'Rafi', primaryGoals: ['budget'], onboardedAt: '2025-03-01T00:00:00.000Z' };

/** A phone: its own database, the queueing wrapper the app uses, and the plain repository sync works on. */
async function device(make: () => Promise<LedgerRepository>, name: string, uid = ACCOUNT_A, tick = { n: 0 }) {
  const raw = await make();
  for (const c of DEFAULT_CATEGORIES) await raw.putCategory(LOCAL, { ...c }); // every install ships the system categories
  const app = new SyncingRepository(raw, () => `2025-03-15T08:${String(tick.n++ % 60).padStart(2, '0')}:00.000Z`);
  let n = 0;
  const svc = new TransactionService(app, { now: () => new Date(`2025-03-15T09:00:${String(tick.n++ % 60).padStart(2, '0')}Z`), newId: () => `${name}${++n}`, timezone: 'Asia/Dhaka' });
  const remote = new PgRemote(uid);
  const sync = () => runSync({ repo: raw, remote, userId: LOCAL, accountId: uid, now: () => new Date('2025-03-15T10:00:00Z') });
  return { raw, app, svc, remote, sync, name };
}
type Device = Awaited<ReturnType<typeof device>>;

async function seed(dev: Device) {
  await dev.app.putProfile(LOCAL, { ...profile });
  for (const a of accounts) await dev.app.putAccount(LOCAL, { ...a, userId: LOCAL });
  await dev.app.putPerson(LOCAL, { id: 'rahim', userId: LOCAL, name: 'Rahim' });
}
const tx = (d: Device, id: string) => d.raw.getTransaction(LOCAL, id);
const exp = (amount: number, date: string, over = {}) => ({ ...expense(amount, date, { categoryId: 'cat.food', ...over }), accountId: 'cash' });

const makers: Array<[string, () => Promise<LedgerRepository>]> = [['in-memory', async () => new InMemoryLedgerRepository()], ['sqlite', sqlRepo]];

describe('wire mapping', () => {
  it('round-trips every record through the server format unchanged', async () => {
    const d = await device(makers[0]![1], 'a');
    await seed(d);
    const t = await d.svc.create(LOCAL, exp(120_050, '2025-03-10', { merchantName: 'Agora', categoryId: 'cat.food.groceries', notes: 'weekly', paidBy: 'me' }));
    const back = fromServerRow('transactions', { ...toServerRow('transactions', t), version: 1, updated_at: t.updatedAt }, LOCAL);
    expect(back).toEqual(t);
    const acc = accounts[2]!;
    expect(fromServerRow('accounts', toServerRow('accounts', { ...acc, userId: LOCAL }), LOCAL)).toEqual({ ...acc, userId: LOCAL });
    const prof = fromServerRow('profiles', toServerRow('profiles', profile), LOCAL, profile);
    expect(prof).toEqual(profile);
  });
});

describe.each(makers)('sync between two devices (%s)', (_label, make) => {
  it('uploads a device’s data the first time, and a second device receives all of it', async () => {
    const a = await device(make, 'a'); await seed(a);
    const t1 = await a.svc.create(LOCAL, exp(25_000, '2025-03-14', { merchantName: 'Uber', categoryId: 'cat.transport.ride_share' }));
    const r = await a.sync();
    expect(r).toMatchObject({ status: 'ok', pending: 0, needsReview: 0, rejected: 0 });
    expect(r.pushed).toBeGreaterThanOrEqual(7);

    const b = await device(make, 'b'); // a new phone, signed in to the same account
    const rb = await b.sync();
    expect(rb.status).toBe('ok');
    expect(await tx(b, t1.id)).toMatchObject({ amountMinor: 25_000, merchantName: 'Uber', createdAt: t1.createdAt, localDate: '2025-03-14' });
    expect((await b.raw.listAccounts(LOCAL)).map((x) => x.id).sort()).toEqual(accounts.map((x) => x.id).sort());
    expect(await b.raw.getProfile(LOCAL)).toMatchObject({ displayName: 'Rafi', currency: 'BDT', primaryGoals: ['budget'] });
    expect((await b.raw.listOutbox(LOCAL)).length).toBe(0); // receiving something never queues it to be sent back
  });

  it('carries an edit and a deletion from one device to the other', async () => {
    const a = await device(make, 'a'); await seed(a);
    const t1 = await a.svc.create(LOCAL, exp(25_000, '2025-03-14', { merchantName: 'Uber' }));
    const t2 = await a.svc.create(LOCAL, exp(10_000, '2025-03-14', { merchantName: 'Tea' }));
    await a.sync();
    const b = await device(make, 'b'); await b.sync();

    await a.svc.update(LOCAL, t1.id, { amountMinor: 30_000 });
    await a.svc.update(LOCAL, t1.id, { notes: 'with tip' }); // two edits before syncing travel as one change
    await a.svc.remove(LOCAL, t2.id);
    expect((await a.raw.listOutbox(LOCAL)).length).toBe(2);
    await a.sync();
    await b.sync();
    expect(await tx(b, t1.id)).toMatchObject({ amountMinor: 30_000, notes: 'with tip' });
    expect((await tx(b, t2.id))?.deletedAt).toBeTruthy();
    // and B can now edit on top, without a false conflict
    await b.svc.update(LOCAL, t1.id, { amountMinor: 31_000 });
    expect(await b.sync()).toMatchObject({ status: 'ok', needsReview: 0, merged: 0 });
    await a.sync();
    expect((await tx(a, t1.id))!.amountMinor).toBe(31_000);
  });

  it('merges a wording-only clash automatically, keeping the syncing device’s words and the server’s numbers', async () => {
    const a = await device(make, 'a'); await seed(a);
    const t = await a.svc.create(LOCAL, exp(25_000, '2025-03-14', { merchantName: 'Uber' }));
    await a.sync();
    const b = await device(make, 'b'); await b.sync();
    await a.svc.update(LOCAL, t.id, { notes: 'from A' });          // both offline
    await b.svc.update(LOCAL, t.id, { notes: 'from B', categoryId: 'cat.transport' });
    await a.sync();
    const rb = await b.sync();
    expect(rb).toMatchObject({ status: 'ok', merged: 1, needsReview: 0, pending: 0 });
    await a.sync();
    for (const d of [a, b]) expect(await tx(d, t.id)).toMatchObject({ notes: 'from B', categoryId: 'cat.transport', amountMinor: 25_000 });
  });

  it('never picks a side silently when money-affecting fields clash, and lets the person decide', async () => {
    const a = await device(make, 'a'); await seed(a);
    const t = await a.svc.create(LOCAL, exp(25_000, '2025-03-14', { merchantName: 'Uber' }));
    await a.sync();
    const b = await device(make, 'b'); await b.sync();
    await a.svc.update(LOCAL, t.id, { amountMinor: 26_000 });
    await b.svc.update(LOCAL, t.id, { amountMinor: 27_000 });
    await a.sync();
    const rb = await b.sync();
    expect(rb).toMatchObject({ needsReview: 1, pending: 0 });
    expect((await tx(b, t.id))!.amountMinor).toBe(26_000); // the ledger shows the server's copy until decided
    const [c] = await b.raw.listConflicts(LOCAL);
    expect(c).toMatchObject({ id: t.id });
    expect(c!.local.amountMinor).toBe(27_000);
    expect(c!.remote.amountMinor).toBe(26_000);

    // "Use mine": apply it as a new edit on top of the server's version; it syncs normally and the conflict is cleared
    await b.svc.update(LOCAL, t.id, { amountMinor: c!.local.amountMinor });
    await b.raw.removeConflict(LOCAL, t.id);
    expect(await b.sync()).toMatchObject({ needsReview: 0, pending: 0 });
    await a.sync();
    expect((await tx(a, t.id))!.amountMinor).toBe(27_000);
  });

  it('treats a delete against an edit as a conflict, not a silent loss', async () => {
    const a = await device(make, 'a'); await seed(a);
    const t = await a.svc.create(LOCAL, exp(25_000, '2025-03-14'));
    await a.sync();
    const b = await device(make, 'b'); await b.sync();
    await a.svc.remove(LOCAL, t.id);
    await b.svc.update(LOCAL, t.id, { amountMinor: 26_000 });
    await a.sync();
    expect(await b.sync()).toMatchObject({ needsReview: 1 });
    expect((await tx(b, t.id))?.deletedAt).toBeTruthy();
    expect((await b.raw.listConflicts(LOCAL))[0]!.local.amountMinor).toBe(26_000);
  });

  it('propagates a deleted budget to the other device', async () => {
    const a = await device(make, 'a'); await seed(a);
    await a.app.putBudget(LOCAL, { id: 'bud1', userId: LOCAL, categoryId: null, amountMinor: 5_000_000, currency: 'BDT' });
    await a.sync();
    const b = await device(make, 'b'); await b.sync();
    expect(await b.raw.listBudgets(LOCAL)).toHaveLength(1);
    await a.app.deleteBudget(LOCAL, 'bud1');
    await a.sync(); await b.sync();
    expect(await b.raw.listBudgets(LOCAL)).toHaveLength(0);
  });

  it('survives a lost reply: sending the same change twice changes nothing and raises no conflict', async () => {
    const a = await device(make, 'a'); await seed(a);
    const t = await a.svc.create(LOCAL, exp(25_000, '2025-03-14'));
    await a.sync();
    await a.svc.update(LOCAL, t.id, { amountMinor: 30_000 });
    // the request reaches the server but the reply is lost, so the device still has it queued
    const items = (await a.raw.listOutbox(LOCAL)).map((i) => ({ entity: i.entity, row: toServerRow(i.entity, i.payload as object), base_version: i.baseVersion }));
    await a.remote.push(items);
    const r = await a.sync();
    expect(r).toMatchObject({ status: 'ok', needsReview: 0, merged: 0, pending: 0 });
    const b = await device(make, 'b'); await b.sync();
    expect((await tx(b, t.id))!.amountMinor).toBe(30_000);
    const server = await db.query<{ n: string }>(`select count(*)::int as n from public.transactions where user_id = '${ACCOUNT_A}'`);
    expect(Number(server.rows[0]!.n)).toBe(1);
  });

  it('keeps a change the server refuses queued, tells the caller, and still syncs everything else', async () => {
    const a = await device(make, 'a'); await seed(a);
    await a.sync();
    // a transaction pointing at an account the server has never heard of
    await a.raw.insertTransaction(LOCAL, { ...(await a.svc.create(LOCAL, exp(100, '2025-03-14'))), id: 'bad', accountId: 'ghost', version: 1 });
    await a.app.putPerson(LOCAL, { id: 'karim', userId: LOCAL, name: 'Karim' });
    await a.raw.enqueueChange(LOCAL, { entity: 'transactions', entityId: 'bad', op: 'upsert', baseVersion: null, payload: await tx(a, 'bad') }, 'now');
    const r = await a.sync();
    expect(r).toMatchObject({ status: 'ok', rejected: 1 });
    expect((await a.raw.listOutbox(LOCAL)).map((i) => i.entityId)).toEqual(['bad']);
    const people = await db.query(`select id from public.people where user_id = '${ACCOUNT_A}' order by id`);
    expect(people.rows.map((x) => (x as { id: string }).id)).toEqual(['karim', 'rahim']);
  });

  it('refuses to mix accounts on one device', async () => {
    const a = await device(make, 'a'); await seed(a);
    await a.sync();
    const sameDeviceOtherAccount = new PgRemote(ACCOUNT_B);
    const r = await runSync({ repo: a.raw, remote: sameDeviceOtherAccount, userId: LOCAL, accountId: ACCOUNT_B, now: () => new Date() });
    expect(r.status).toBe('wrong_account');
    const leaked = await db.query(`select count(*)::int as n from public.accounts where user_id = '${ACCOUNT_B}'`);
    expect(Number((leaked.rows[0] as { n: number }).n)).toBe(0);
  });

  it('adopts the profile another device already set up instead of overwriting it', async () => {
    const a = await device(make, 'a'); await seed(a); await a.sync();
    const fresh = await device(make, 'fresh');
    await fresh.raw.putProfile(LOCAL, { ...profile, currency: 'USD', displayName: null, onboardedAt: null });
    await fresh.sync();
    expect(await fresh.raw.getProfile(LOCAL)).toMatchObject({ currency: 'BDT', displayName: 'Rafi' });
    const server = await db.query(`select currency from public.profiles where user_id = '${ACCOUNT_A}'`);
    expect((server.rows[0] as { currency: string }).currency).toBe('BDT');
  });

  it('is quiet when nothing changed', async () => {
    const a = await device(make, 'a'); await seed(a); await a.sync();
    const before = a.remote.log.length;
    expect(await a.sync()).toMatchObject({ status: 'ok', pushed: 0, pending: 0 });
    expect(a.remote.log.length).toBe(before); // nothing to send means no request
  });
});

describe('conflict rules', () => {
  const base = { id: 't', userId: LOCAL, type: 'expense', amountMinor: 100, currency: 'BDT', categoryId: null, merchantName: null, accountId: 'cash', toAccountId: null, localDate: '2025-03-14', localTime: null, notes: null,
    paidBy: 'me', splits: null, counterpartyId: null, debtDirection: null, repaymentDirection: null, goalId: null, recurringRuleId: null, occurrenceDate: null, source: 'manual', aiConfidence: null, rawInput: null,
    createdAt: 'c', updatedAt: 'u', deletedAt: null, version: 2 } as unknown as Transaction;
  it.each([
    ['identical', {}, {}, 'same'],
    ['note only', { notes: 'x' }, {}, 'merge'],
    ['category and merchant', { categoryId: 'a', merchantName: 'm' }, { notes: 'y' }, 'merge'],
    ['amount', { amountMinor: 200 }, {}, 'review'],
    ['date', { localDate: '2025-03-15' }, {}, 'review'],
    ['account', { accountId: 'bank' }, {}, 'review'],
    ['deleted vs not', { deletedAt: 'now' }, {}, 'review'],
    ['split', { splits: [{ personId: 'me', amountMinor: 50 }, { personId: 'p', amountMinor: 50 }] }, {}, 'review'],
  ])('%s → %s', (_n, localOver, remoteOver, kind) => {
    expect(resolveTransactionConflict({ ...base, ...localOver } as Transaction, { ...base, ...remoteOver } as Transaction).kind).toBe(kind);
  });
});

describe('the engine guards its own contract', () => {
  it('refuses to run on the queueing wrapper, which would send pulled data straight back', async () => {
    const raw = new InMemoryLedgerRepository();
    await expect(runSync({ repo: new SyncingRepository(raw), remote: new PgRemote(ACCOUNT_A), userId: LOCAL, accountId: ACCOUNT_A, now: () => new Date() })).rejects.toThrow(/underlying repository/);
  });
  it('treats a failing server as a failed run that loses nothing', async () => {
    const a = await device(makers[0]![1], 'a'); await seed(a);
    const down: SyncRemote = { push: async () => { throw new Error('offline'); }, pull: async () => { throw new Error('offline'); } };
    const queued = (await a.raw.listOutbox(LOCAL)).length;
    const r = await runSync({ repo: a.raw, remote: down, userId: LOCAL, accountId: ACCOUNT_A, now: () => new Date() });
    expect(r.status).toBe('failed');
    expect((await a.raw.listOutbox(LOCAL)).length).toBe(queued);
    expect((await a.sync()).status).toBe('ok'); // and the next run simply carries on
  });
});

describe('server-side sync is tenant-safe', () => {
  it('one account never sees or touches another’s rows, even with the same ids', async () => {
    const a = await device(makers[0]![1], 'a'); await seed(a);
    await a.svc.create(LOCAL, exp(25_000, '2025-03-14', { merchantName: 'Uber' }));
    await a.sync();
    const asB = new PgRemote(ACCOUNT_B);
    expect((await asB.pull(0, 500)).rows).toEqual([]);
    const r = await asB.push([{ entity: 'accounts', row: { id: 'cash', name: 'Hijack', type: 'cash', currency: 'BDT', user_id: ACCOUNT_A }, base_version: null }]);
    expect(r[0]!.status).toBe('ok'); // B gets its own "cash"; the user_id in the payload is ignored
    const mine = await db.query(`select user_id, name from public.accounts where id = 'cash' order by user_id`);
    expect(mine.rows).toEqual([{ user_id: ACCOUNT_A, name: 'Cash' }, { user_id: ACCOUNT_B, name: 'Hijack' }]);
  });
  it('anonymous callers cannot call sync at all', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query(`select public.sync_pull(0)`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`select public.sync_push('[]'::jsonb)`)).rejects.toThrow(/permission denied/);
    } finally { await db.exec('reset role'); }
  });
  it('rejects unknown tables and oversized batches without touching anything', async () => {
    const asA = new PgRemote(ACCOUNT_A);
    const r = await asA.push([{ entity: 'audit_log' as never, row: { id: 'x' }, base_version: null }]);
    expect(r[0]!.status).toBe('rejected');
    await expect(asA.push(Array.from({ length: 501 }, () => ({ entity: 'people' as const, row: { id: 'p', name: 'x' }, base_version: null })))).rejects.toThrow();
  });
});

describe('your own categories sync before what uses them', () => {
  it('a custom category and a transaction in it reach the other phone, parents first', async () => {
    const a = await device(makers[0]![1], 'a'); await seed(a);
    await a.app.putCategory(LOCAL, { id: 'cat.mine.pets', userId: LOCAL, parentId: null, name: 'Pets', kind: 'expense', archivedAt: null });
    await a.app.putCategory(LOCAL, { id: 'cat.mine.vet', userId: LOCAL, parentId: 'cat.mine.pets', name: 'Vet', kind: 'expense', archivedAt: null });
    const t = await a.svc.create(LOCAL, exp(80_000, '2025-03-14', { categoryId: 'cat.mine.vet', merchantName: 'PetCare' }));
    expect(await a.sync()).toMatchObject({ status: 'ok', rejected: 0, pending: 0 }); // the transaction was not refused for an unknown category
    const b = await device(makers[0]![1], 'b'); await b.sync();
    expect((await b.raw.listCategories(LOCAL)).filter((c) => c.userId !== null).map((c) => c.id).sort()).toEqual(['cat.mine.pets', 'cat.mine.vet']);
    expect((await tx(b, t.id))!.categoryId).toBe('cat.mine.vet');
    await a.app.putCategory(LOCAL, { id: 'cat.mine.vet', userId: LOCAL, parentId: 'cat.mine.pets', name: 'Vet', kind: 'expense', archivedAt: '2025-03-15T00:00:00.000Z' });
    await a.sync(); await b.sync();
    expect((await b.raw.listCategories(LOCAL)).find((c) => c.id === 'cat.mine.vet')!.archivedAt).toBe('2025-03-15T00:00:00.000Z');
  });
  it('built-in categories are never uploaded, and an id belonging to someone else is refused', async () => {
    const a = await device(makers[0]![1], 'a'); await seed(a); await a.sync();
    const owned = await db.query(`select count(*)::int as n from public.categories where user_id = '${ACCOUNT_A}'`);
    expect(Number((owned.rows[0] as { n: number }).n)).toBe(0);
    const asB = new PgRemote(ACCOUNT_B);
    const r = await asB.push([{ entity: 'categories', row: { id: 'cat.food', name: 'Hijack', kind: 'expense' }, base_version: null }]);
    expect(r[0]!.status).toBe('rejected'); // cat.food is a built-in category
    const still = await db.query(`select name from public.categories where id = 'cat.food'`);
    expect((still.rows[0] as { name: string }).name).toBe('Food');
  });
});
