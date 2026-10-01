import type { LedgerRepository } from '../repository';
import type { Id, Transaction } from '../types';
import { fromServerRow, isTombstone, toServerRow } from './mapping';
import { SyncingRepository } from './syncingRepository';
import { resolveTransactionConflict } from './resolve';
import type { OutboxItem, PushItem, PushResult, SyncEntity, SyncRemote } from './types';

export interface SyncReport {
  status: 'ok' | 'wrong_account' | 'failed';
  pushed: number; pulled: number;
  /** Transactions changed on two devices in a way only a person can settle. They wait in the conflicts list. */
  needsReview: number;
  /** Differences in wording only, merged automatically. */
  merged: number;
  /** Changes the server refused; they stay queued. */
  rejected: number;
  pending: number;
}

export interface SyncDeps { repo: LedgerRepository; remote: SyncRemote; userId: Id; accountId: string; now: () => Date }

const CURSOR = 'sync.cursor', ACCOUNT = 'sync.account', SEEDED = 'sync.seeded';
/** A page may be overlapped a little: stamps are handed out in commit order only approximately, so a late-committing row could otherwise be missed. Re-applying a row is harmless. */
const PULL_OVERLAP = 50;
const PAGE = 500, BATCH = 100, MAX_ROUNDS = 5;

const keyOf = (e: SyncEntity, id: string) => `${e}:${id}`;

/**
 * One synchronisation: send what is queued, then fetch what changed elsewhere. Safe to run at any time and any number of times; if the
 * connection drops halfway the next run carries on (the queue only shrinks when the server confirms, and applying a pulled row twice
 * changes nothing).
 *
 * `accountId` is the signed-in account. A device only ever syncs with one account: if it was linked to another, nothing is sent or
 * received, so one person's records can never be merged into another person's.
 */
export async function runSync(d: SyncDeps): Promise<SyncReport> {
  const { repo, userId } = d;
  // Applying what the server sent must not queue it to be sent back, so sync works on the plain repository, never the queueing wrapper.
  if (repo instanceof SyncingRepository) throw new Error('runSync needs the underlying repository, not the SyncingRepository wrapper');
  const report: SyncReport = { status: 'ok', pushed: 0, pulled: 0, needsReview: 0, merged: 0, rejected: 0, pending: 0 };
  try {
    const linked = await repo.getSetting(userId, ACCOUNT);
    if (linked && linked !== d.accountId) return { ...report, status: 'wrong_account', pending: (await repo.listOutbox(userId, 1000)).length };

    const first = (await repo.getSetting(userId, SEEDED)) !== '1';
    if (first) {
      // The first time, listen before speaking: if this account already has a profile (another device set it up), keep it rather than overwrite it.
      const seen = await pull(d, report);
      await seedOutbox(d, !seen.profile);
      await repo.putSetting(userId, ACCOUNT, d.accountId);
      await repo.putSetting(userId, SEEDED, '1');
    }
    await push(d, report);
    if (!first) await pull(d, report);
    report.pending = (await repo.listOutbox(userId, 1000)).length;
    report.needsReview = (await repo.listConflicts(userId)).length;
    return report;
  } catch {
    // Deliberately no error details: they can quote values. The queue is untouched, so the next run retries.
    return { ...report, status: 'failed', pending: (await repo.listOutbox(userId, 1000).catch(() => [])).length };
  }
}

/** Queues every record already on the device, parents before children. */
async function seedOutbox(d: SyncDeps, includeProfile: boolean) {
  const { repo, userId } = d, now = d.now().toISOString();
  const q = (entity: SyncEntity, entityId: string, payload: unknown, baseVersion: number | null = null) => repo.enqueueChange(userId, { entity, entityId, op: 'upsert', baseVersion, payload }, now);
  const pending = new Set((await repo.listOutbox(userId, 100000)).map((o) => keyOf(o.entity, o.entityId)));
  const add = async (entity: SyncEntity, id: string, payload: unknown) => { if (!pending.has(keyOf(entity, id))) await q(entity, id, payload); };
  for (const a of await repo.listAccounts(userId)) await add('accounts', a.id, a);
  for (const p of await repo.listPeople(userId)) await add('people', p.id, p);
  for (const g of await repo.listGoals(userId)) await add('goals', g.id, g);
  for (const r of await repo.listRecurringRules(userId)) await add('recurring_rules', r.id, r);
  for (const b of await repo.listBudgets(userId)) await add('budgets', b.id, b);
  for (const t of await repo.listTransactions(userId, { includeDeleted: true })) await add('transactions', t.id, t);
  if (includeProfile) { const p = await repo.getProfile(userId); if (p) await add('profiles', 'profile', p); }
}

async function push(d: SyncDeps, report: SyncReport) {
  const { repo, userId } = d;
  const refused = new Set<number>(); // refused this run: left for next time, not hammered
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const items = (await repo.listOutbox(userId, BATCH + refused.size)).filter((i) => i.attempts < 5 && !refused.has(i.seq)).slice(0, BATCH);
    if (!items.length) return;
    const wire: PushItem[] = items.map((i) => ({ entity: i.entity, row: toServerRow(i.entity, i.payload as object, i.op === 'delete' ? d.now().toISOString() : undefined), base_version: i.baseVersion }));
    const results = await d.remote.push(wire);
    let progressed = false;
    for (let n = 0; n < items.length; n++) {
      const item = items[n]!, res = results[n];
      if (!res || res.entity !== item.entity) { await repo.failOutbox(userId, item.seq); refused.add(item.seq); report.rejected++; continue; }
      if ((await settle(d, item, res, report)) === 'rejected') refused.add(item.seq); else progressed = true;
    }
    if (!progressed) return;
  }
}

async function settle(d: SyncDeps, item: OutboxItem, res: PushResult, report: SyncReport): Promise<'done' | 'requeued' | 'rejected'> {
  const { repo, userId } = d;
  if (res.status === 'rejected') { await repo.failOutbox(userId, item.seq); report.rejected++; return 'rejected'; }
  if (res.status === 'ok') {
    const version = item.entity === 'transactions' ? Number(res.row.version) : null;
    await repo.completeOutbox(userId, item.seq, item.rev, version);
    if (version !== null) await repo.setTransactionVersion(userId, item.entityId, version);
    report.pushed++;
    return 'done';
  }
  // conflict: only transactions are version-checked
  const remote = fromServerRow('transactions', res.row, userId);
  const local = item.payload as Transaction;
  const r = resolveTransactionConflict(local, remote);
  await repo.atomic(async () => {
    if (r.kind === 'same') { await repo.putTransactionRaw(userId, remote); await repo.dropOutbox(userId, 'transactions', item.entityId); }
    else if (r.kind === 'merge') {
      await repo.putTransactionRaw(userId, r.merged);
      await repo.dropOutbox(userId, 'transactions', item.entityId);
      await repo.enqueueChange(userId, { entity: 'transactions', entityId: item.entityId, op: 'upsert', baseVersion: remote.version, payload: r.merged }, d.now().toISOString());
    } else {
      await repo.putTransactionRaw(userId, remote); // the server's copy is what the ledger shows until the person decides
      await repo.dropOutbox(userId, 'transactions', item.entityId);
      await repo.putConflict(userId, { id: item.entityId, userId, local, remote, createdAt: d.now().toISOString() });
    }
  });
  if (r.kind === 'merge') { report.merged++; return 'requeued'; }
  return 'done';
}

/** Applies what the server has. Anything with a change still waiting to be sent is left alone: that change will be sent (or conflict) first. */
async function pull(d: SyncDeps, report: SyncReport): Promise<{ profile: boolean }> {
  const { repo, userId } = d;
  const seen = { profile: false };
  const pendingKeys = new Set((await repo.listOutbox(userId, 100000)).map((o) => keyOf(o.entity, o.entityId)));
  let cursor = Number((await repo.getSetting(userId, CURSOR)) ?? 0);
  for (let page = 0; page < 200; page++) {
    const res = await d.remote.pull(Math.max(0, cursor - PULL_OVERLAP), PAGE);
    for (const { entity, row } of res.rows) {
      if (entity === 'profiles') seen.profile = true;
      const id = entity === 'profiles' ? 'profile' : String(row.id);
      if (pendingKeys.has(keyOf(entity, id))) continue;
      await repo.atomic(async () => { await apply(d, entity, row); });
      report.pulled++;
    }
    cursor = Math.max(cursor, res.cursor);
    await repo.putSetting(userId, CURSOR, String(cursor));
    if (!res.more) break;
  }
  return seen;
}

async function apply(d: SyncDeps, entity: SyncEntity, row: Record<string, unknown>) {
  const { repo, userId } = d;
  switch (entity) {
    case 'accounts': return repo.putAccount(userId, fromServerRow('accounts', row, userId));
    case 'people': return repo.putPerson(userId, fromServerRow('people', row, userId));
    case 'goals': return repo.putGoal(userId, fromServerRow('goals', row, userId));
    case 'recurring_rules': return repo.putRecurringRule(userId, fromServerRow('recurring_rules', row, userId));
    case 'budgets': return isTombstone('budgets', row) ? repo.deleteBudget(userId, String(row.id)) : repo.putBudget(userId, fromServerRow('budgets', row, userId));
    case 'transactions': return repo.putTransactionRaw(userId, fromServerRow('transactions', row, userId));
    case 'profiles': return repo.putProfile(userId, fromServerRow('profiles', row, userId, await repo.getProfile(userId)));
  }
}
