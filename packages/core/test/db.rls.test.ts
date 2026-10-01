import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, categoriesSeedSql } from '../src';

/**
 * Runs the real server migrations on real Postgres (PGlite) and attacks the rules: tenant isolation, constraints,
 * append-only audit, quota, export and deletion. Supabase's own pieces (roles, auth.users, auth.uid) are reproduced as they
 * exist on the platform so the policies behave exactly as they will in production.
 */
const MIGRATIONS_DIR = new URL('../../../supabase/migrations/', import.meta.url);
const BOOTSTRAP = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- Supabase grants new public tables to these roles by default; the migration must narrow that.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BOOTSTRAP);
  for (const f of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(f, MIGRATIONS_DIR), 'utf8'));
}, 60_000);
afterAll(async () => { await db.close(); });
// Row-wise cascade, exactly like deleting a user in production (TRUNCATE CASCADE would also wipe the shared categories).
beforeEach(async () => {
  await db.exec('delete from auth.users');
  await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}')`);
});

type Who = typeof A | typeof B | 'anon' | 'service';
/** Runs `fn` as a given caller (a signed-in user, anonymous, or the server), then restores the superuser. */
async function as<T>(who: Who, fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${who === 'anon' ? 'anon' : who === 'service' ? 'service_role' : 'authenticated'}`);
  if (who !== 'anon' && who !== 'service') await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who]);
  try { return await fn(); }
  finally { await db.exec('reset role'); await db.exec(`select set_config('request.jwt.claim.sub', '', false)`); }
}
const count = async (table: string, where = 'true') => Number((await db.query<{ n: string }>(`select count(*)::int as n from public.${table} where ${where}`)).rows[0]!.n);
const addAccount = (uid: string, id = 'cash', extra = '') => db.query(`insert into public.accounts (user_id, id, name, type, currency ${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, $2, 'Cash', 'cash', 'BDT' ${extra ? ', ' + extra.split('=')[1] : ''})`, [uid, id]);
const addTx = (uid: string, cols: Record<string, string | number | null> = {}) => {
  const row = { id: 't1', type: 'expense', amount_minor: 45000, currency: 'BDT', account_id: 'cash', local_date: '2025-03-15', source: 'text', ...cols } as Record<string, string | number | null>;
  const keys = ['user_id', ...Object.keys(row)];
  return db.query(`insert into public.transactions (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`, [uid, ...Object.values(row)]);
};

describe('migrations', () => {
  it('apply cleanly and every public table is protected by row-level security', async () => {
    const t = await db.query<{ relname: string; relrowsecurity: boolean }>(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`);
    expect(t.rows.length).toBeGreaterThanOrEqual(10);
    expect(t.rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });
  it('seed exactly the app\'s system categories, and the generated SQL file is up to date', async () => {
    expect(await count('categories', 'user_id is null')).toBe(DEFAULT_CATEGORIES.length);
    expect(readFileSync(new URL('20250101000100_system_categories.sql', MIGRATIONS_DIR), 'utf8')).toBe(categoriesSeedSql());
    const { rows } = await db.query<{ id: string }>(`select id from public.categories where user_id is null order by id`);
    expect(rows.map((r) => r.id)).toEqual(DEFAULT_CATEGORIES.map((c) => c.id).sort());
  });
});

describe('tenant isolation', () => {
  it('anonymous callers can touch nothing', async () => {
    await addAccount(A);
    for (const sql of ['select * from public.accounts', 'select * from public.transactions', `insert into public.accounts (user_id,id,name,type,currency) values ('${A}','x','x','cash','BDT')`, 'select * from public.categories'])
      await expect(as('anon', () => db.query(sql)), sql).rejects.toThrow(/permission denied/);
  });
  it('a user sees only their own rows in every table', async () => {
    await addAccount(A); await addAccount(B);
    await addTx(A); await addTx(B);
    await db.query(`insert into public.people (user_id,id,name) values ('${A}','p','Rahim'), ('${B}','p','Karim')`);
    await db.query(`insert into public.budgets (user_id,id,amount_minor,currency) values ('${A}','b',100,'BDT'), ('${B}','b',200,'BDT')`);
    await db.query(`insert into public.goals (user_id,id,name,currency,target_minor) values ('${A}','g','Trip','BDT',100), ('${B}','g','Car','BDT',200)`);
    await db.query(`insert into public.profiles (user_id) values ('${A}'), ('${B}')`);
    for (const t of ['accounts', 'transactions', 'people', 'budgets', 'goals', 'profiles']) {
      const rows = await as(A, () => db.query<{ user_id: string }>(`select user_id from public.${t}`));
      expect(rows.rows.map((r) => r.user_id), t).toEqual([A]);
    }
  });
  it('cannot read, change or delete another user\'s rows (the statements simply match nothing)', async () => {
    await addAccount(A); await addTx(A);
    await as(B, async () => {
      expect((await db.query(`select * from public.transactions`)).rows).toHaveLength(0);
      expect((await db.query(`update public.transactions set amount_minor = 1 where id = 't1'`)).affectedRows).toBe(0);
      expect((await db.query(`delete from public.transactions where id = 't1'`)).affectedRows).toBe(0);
      expect((await db.query(`delete from public.accounts where id = 'cash'`)).affectedRows).toBe(0);
    });
    expect(Number((await db.query<{ amount_minor: string }>(`select amount_minor from public.transactions`)).rows[0]!.amount_minor)).toBe(45000);
  });
  it('cannot write rows as someone else, or hand a row to someone else', async () => {
    await as(B, async () => {
      await expect(db.query(`insert into public.accounts (user_id,id,name,type,currency) values ('${A}','x','x','cash','BDT')`)).rejects.toThrow(/row-level security/);
      await db.query(`insert into public.accounts (user_id,id,name,type,currency) values ('${B}','mine','Mine','cash','BDT')`);
      await expect(db.query(`update public.accounts set user_id = '${A}' where id = 'mine'`)).rejects.toThrow(/row-level security/);
    });
    expect(await count('accounts', `user_id = '${A}'`)).toBe(0);
  });
  it('a transaction cannot reference another user\'s account, person, goal or category', async () => {
    await addAccount(B, 'theirs');
    await db.query(`insert into public.people (user_id,id,name) values ('${B}','bp','Karim')`);
    await db.query(`insert into public.goals (user_id,id,name,currency,target_minor) values ('${B}','bg','Car','BDT',200)`);
    await db.query(`insert into public.categories (id,user_id,name,kind) values ('b-cat','${B}','Mine','expense')`);
    await addAccount(A);
    await expect(as(A, () => addTx(A, { account_id: 'theirs' }))).rejects.toThrow(/foreign key/);
    await expect(as(A, () => addTx(A, { type: 'debt', counterparty_id: 'bp', debt_direction: 'lent' }))).rejects.toThrow(/foreign key/);
    await expect(as(A, () => addTx(A, { type: 'goal_contribution', goal_id: 'bg', to_account_id: 'cash' }))).rejects.toThrow(/foreign key|differ/);
    await expect(as(A, () => addTx(A, { category_id: 'b-cat' }))).rejects.toThrow(/not available to this user/);
    await expect(as(A, () => db.query(`insert into public.budgets (user_id,id,category_id,amount_minor,currency) values ('${A}','b','b-cat',1,'BDT')`))).rejects.toThrow(/not available to this user/);
    expect(await count('transactions')).toBe(0);
  });
});

describe('categories', () => {
  it('are readable to everyone signed in, but system categories can never be changed', async () => {
    await as(A, async () => {
      expect(Number((await db.query<{ n: string }>(`select count(*)::int as n from public.categories where user_id is null`)).rows[0]!.n)).toBe(DEFAULT_CATEGORIES.length);
      await expect(db.query(`insert into public.categories (id,user_id,name,kind) values ('sys2', null, 'X', 'expense')`)).rejects.toThrow(/row-level security/);
      expect((await db.query(`update public.categories set name = 'Hacked' where id = 'cat.food'`)).affectedRows).toBe(0);
      expect((await db.query(`delete from public.categories where id = 'cat.food'`)).affectedRows).toBe(0);
    });
    expect((await db.query<{ name: string }>(`select name from public.categories where id = 'cat.food'`)).rows[0]!.name).toBe('Food');
  });
  it('a user\'s own categories are private to them, and can sit under a system parent', async () => {
    await as(A, () => db.query(`insert into public.categories (id,user_id,parent_id,name,kind) values ('a-cat','${A}','cat.food','Street food','expense')`));
    expect(await as(B, () => db.query(`select * from public.categories where id = 'a-cat'`)).then((r) => r.rows)).toHaveLength(0);
    expect(await as(A, () => db.query(`select * from public.categories where id = 'a-cat'`)).then((r) => r.rows)).toHaveLength(1);
  });
});

describe('transaction integrity', () => {
  beforeEach(async () => { await addAccount(A); await addAccount(A, 'bank'); await db.query(`insert into public.people (user_id,id,name) values ('${A}','rahim','Rahim')`); });
  const bad = (cols: Record<string, string | number | null>, why: RegExp) => expect(addTx(A, cols)).rejects.toThrow(why);

  it('accepts a normal expense and a transfer', async () => {
    await addTx(A);
    await addTx(A, { id: 't2', type: 'transfer', account_id: 'cash', to_account_id: 'bank' });
    expect(await count('transactions')).toBe(2);
  });
  it('rejects non-positive amounts, bad currency, bad type, bad ids and out-of-range confidence', async () => {
    await bad({ amount_minor: 0 }, /amount_minor/); await bad({ amount_minor: -5 }, /amount_minor/);
    await bad({ currency: 'taka' }, /currency/); await bad({ type: 'gift' }, /type/);
    await bad({ id: 'has space' }, /id/); await bad({ ai_confidence: 1.5 }, /ai_confidence/);
    await bad({ local_date: '2025-02-30' }, /date/);
  });
  it('enforces transfer rules', async () => {
    await bad({ type: 'transfer', account_id: 'cash', to_account_id: 'cash' }, /differ/);
    await bad({ type: 'transfer', account_id: 'cash' }, /destination/);
    await bad({ type: 'expense', to_account_id: 'bank' }, /destination/);
    await bad({ type: 'goal_contribution', account_id: 'cash', to_account_id: 'bank' }, /goal_required/);
  });
  it('enforces debt, repayment and account rules', async () => {
    await bad({ type: 'debt', debt_direction: 'lent' }, /needs_party/);
    await bad({ type: 'debt', counterparty_id: 'rahim' }, /needs_party/);
    await bad({ type: 'repayment', counterparty_id: 'rahim' }, /needs_party/);
    await bad({ account_id: null }, /account_required/);
  });
  it('enforces split rules: sums, people, and who may be split', async () => {
    const splits = (a: number, b: number, p = 'rahim') => JSON.stringify([{ personId: 'me', amountMinor: a }, { personId: p, amountMinor: b }]);
    await addTx(A, { id: 'ok', account_id: null, paid_by: 'rahim', amount_minor: 150000, splits: splits(75000, 75000) });
    await addTx(A, { id: 'ok2', amount_minor: 100000, splits: splits(50000, 50000) });
    await bad({ id: 's1', amount_minor: 100000, splits: splits(60000, 50000) }, /add up/);
    await bad({ id: 's2', amount_minor: 100000, splits: splits(50000, 50000, 'ghost') }, /not one of this user/);
    await bad({ id: 's3', amount_minor: 100000, splits: JSON.stringify([{ personId: 'me', amountMinor: -1 }, { personId: 'rahim', amountMinor: 100001 }]) }, /whole, non-negative/);
    await bad({ id: 's4', amount_minor: 100000, splits: JSON.stringify([{ personId: 'me', amountMinor: 100000.5 }]) }, /whole, non-negative/);
    await bad({ id: 's5', amount_minor: 100000, splits: '{}' }, /non-empty array/);
    await bad({ id: 's6', type: 'income', splits: splits(22500, 22500) }, /only_expenses_split/);
    await bad({ id: 's7', account_id: null, paid_by: 'rahim' }, /needs_split|account_required/);
    await bad({ id: 's8', paid_by: 'ghost', account_id: null, amount_minor: 100, splits: splits(50, 50) }, /not one of this user/);
  });
  it('allows one transaction per recurring occurrence, until it is soft-deleted', async () => {
    await db.query(`insert into public.recurring_rules (user_id,id,name,type,amount_minor,currency,account_id,frequency,anchor_date) values ('${A}','r1','Rent','expense',2500000,'BDT','bank','monthly','2025-01-05')`);
    const occ = { recurring_rule_id: 'r1', occurrence_date: '2025-03-05' };
    await addTx(A, { id: 'p1', ...occ });
    await expect(addTx(A, { id: 'p2', ...occ })).rejects.toThrow(/duplicate key|unique/);
    await db.query(`update public.transactions set deleted_at = now(), version = 2 where id = 'p1'`);
    await addTx(A, { id: 'p3', ...occ });
    await expect(addTx(A, { id: 'p4', recurring_rule_id: 'r1' })).rejects.toThrow(/occurrence_pair/);
  });
  it('detects conflicting updates with the version number and stamps updated_at', async () => {
    await addTx(A);
    const before = (await db.query<{ updated_at: string }>(`select updated_at from public.transactions`)).rows[0]!.updated_at;
    await db.query(`update public.transactions set amount_minor = 50000, version = 2 where id = 't1'`);
    await expect(db.query(`update public.transactions set amount_minor = 60000, version = 2 where id = 't1'`)).rejects.toThrow(/version conflict/);
    await expect(db.query(`update public.transactions set amount_minor = 60000 where id = 't1'`)).rejects.toThrow(/version conflict/);
    const after = (await db.query<{ updated_at: string; amount_minor: string }>(`select updated_at, amount_minor from public.transactions`)).rows[0]!;
    expect(Number(after.amount_minor)).toBe(50000);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });
  it('deleting an account that transactions use is refused', async () => {
    await addTx(A);
    await expect(db.query(`delete from public.accounts where id = 'cash'`)).rejects.toThrow(/foreign key/);
  });
});

describe('audit log is append-only', () => {
  it('lets a user append and read their own entries but never change or remove them', async () => {
    const entry = `insert into public.audit_log (user_id,id,entity,entity_id,action,at,changed_fields) values ('${A}','a1','transaction','t1','create',now(),'{amount_minor}')`;
    await as(A, () => db.query(entry));
    await as(A, async () => {
      expect((await db.query(`select * from public.audit_log`)).rows).toHaveLength(1);
      await expect(db.query(`update public.audit_log set action = 'delete' where id = 'a1'`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`delete from public.audit_log where id = 'a1'`)).rejects.toThrow(/permission denied/);
    });
    expect(await as(B, () => db.query(`select * from public.audit_log`)).then((r) => r.rows)).toHaveLength(0);
    await expect(as(B, () => db.query(entry))).rejects.toThrow(/row-level security/); // cannot write into someone else's log
  });
});

describe('AI allowance', () => {
  const consume = (who: Who, user: string, limit = 3) => as(who, () => db.query<{ consume_ai_quota: boolean }>(`select public.consume_ai_quota($1, $2)`, [user, limit]).then((r) => r.rows[0]!.consume_ai_quota));
  it('counts per user per day and stops at the limit', async () => {
    expect([await consume('service', A), await consume('service', A), await consume('service', A), await consume('service', A)]).toEqual([true, true, true, false]);
    expect(await consume('service', B)).toBe(true); // another user is unaffected
    expect((await db.query<{ count: number }>(`select count from public.ai_usage where user_id = '${A}'`)).rows[0]!.count).toBe(3); // the refused call is not counted
  });
  it('resets on a new day', async () => {
    await consume('service', A, 1); expect(await consume('service', A, 1)).toBe(false);
    await db.query(`update public.ai_usage set day = day - 1`);
    expect(await consume('service', A, 1)).toBe(true);
  });
  it('is not callable by clients, so nobody can reset or inflate their own allowance', async () => {
    await expect(consume(A, A)).rejects.toThrow(/permission denied/);
    await expect(consume('anon', A)).rejects.toThrow(/permission denied/);
    await expect(as(A, () => db.query(`insert into public.ai_usage (user_id, day, count) values ('${A}', current_date, 0)`))).rejects.toThrow(/permission denied/);
    await expect(as(A, () => db.query(`update public.ai_usage set count = 0`))).rejects.toThrow(/permission denied/);
    expect(await consume('service', A, 0)).toBe(false); // a nonsense limit never grants access
  });
  it('lets a user read only their own usage', async () => {
    await consume('service', A); await consume('service', B);
    expect((await as(A, () => db.query<{ user_id: string }>(`select user_id from public.ai_usage`))).rows.map((r) => r.user_id)).toEqual([A]);
  });
});

describe('export and account deletion', () => {
  beforeEach(async () => {
    for (const [u, name] of [[A, 'Rahim'], [B, 'Karim']] as const) {
      await db.query(`insert into public.profiles (user_id) values ('${u}')`);
      await addAccount(u); await addTx(u);
      await db.query(`insert into public.people (user_id,id,name) values ('${u}','p','${name}')`);
      await db.query(`insert into public.transactions (user_id,id,type,amount_minor,currency,account_id,local_date,source,deleted_at,version) values ('${u}','gone','expense',1,'BDT','cash','2025-03-01','manual', now(), 2)`);
    }
    await db.query(`insert into public.categories (id,user_id,name,kind) values ('a-cat','${A}','Mine','expense')`);
  });
  it('exports everything the user owns, including soft-deleted rows, and nothing of anyone else\'s', async () => {
    const { rows } = await as(A, () => db.query<{ export_my_data: any }>(`select public.export_my_data()`));
    const doc = rows[0]!.export_my_data;
    expect(doc.transactions.map((t: any) => t.id).sort()).toEqual(['gone', 't1']);
    expect(doc.accounts).toHaveLength(1);
    expect(doc.people.map((p: any) => p.name)).toEqual(['Rahim']);
    expect(doc.categories.map((c: any) => c.id)).toEqual(['a-cat']); // own categories only, not the shared system set
    expect(JSON.stringify(doc)).not.toContain(B);
    expect(JSON.stringify(doc)).not.toContain('Karim');
  });
  it('exports nothing to an anonymous caller', async () => {
    await expect(as('anon', () => db.query(`select public.export_my_data()`))).rejects.toThrow(/permission denied/);
  });
  it('deleting the account removes every row the user owns and leaves other users untouched', async () => {
    await as(A, () => db.query(`select public.delete_my_account()`));
    for (const t of ['profiles', 'accounts', 'people', 'transactions']) expect(await count(t, `user_id = '${A}'`), t).toBe(0);
    expect(await count('categories', `user_id = '${A}'`)).toBe(0);
    expect(await count('transactions', `user_id = '${B}'`)).toBe(2);
    expect(await count('categories', 'user_id is null')).toBe(DEFAULT_CATEGORIES.length); // shared data survives
    await expect(as('anon', () => db.query(`select public.delete_my_account()`))).rejects.toThrow(/permission denied/);
  });
});
