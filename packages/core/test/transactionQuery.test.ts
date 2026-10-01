import { describe, expect, it } from 'vitest';
import { activeFilterCount, describeTransactions, draftFromTransaction, finalizeDraft, queryTransactions, reviseDraft, validateDraft } from '../src';
import { USER, accounts, categories, expense, setup } from './fixtures';

async function seeded() {
  const { repo, svc } = setup();
  await svc.create(USER, expense(25_000, '2025-03-14', { merchantName: 'Uber', categoryId: 'rideshare', accountId: 'bkash' }));
  await svc.create(USER, expense(250_000, '2025-03-10', { merchantName: 'Agora', categoryId: 'groceries', notes: 'weekly shop' }));
  await svc.create(USER, expense(120_050, '2025-02-10', { merchantName: 'Cafe', categoryId: 'dining' }));
  await svc.create(USER, { type: 'income', amountMinor: 5_000_000, currency: 'BDT', localDate: '2025-03-01', source: 'manual', accountId: 'bank', categoryId: 'salary' });
  await svc.create(USER, { type: 'transfer', amountMinor: 100_000, currency: 'BDT', localDate: '2025-03-05', source: 'manual', accountId: 'bank', toAccountId: 'cash' });
  const txs = await repo.listTransactions(USER);
  return { repo, svc, items: describeTransactions(txs, accounts, categories) };
}
const q = (items: Awaited<ReturnType<typeof seeded>>['items'], query: Parameters<typeof queryTransactions>[1]) => queryTransactions(items, query, '2025-03-15').map((i) => i.title);

describe('transaction search and filters', () => {
  it('finds by merchant, category, note and account, ignoring case', async () => {
    const { items } = await seeded();
    expect(q(items, { text: 'uber' })).toEqual(['Uber']);
    expect(q(items, { text: 'GROCERIES' })).toEqual(['Agora']);
    expect(q(items, { text: 'weekly' })).toEqual(['Agora']);
    expect(q(items, { text: 'bkash' })).toEqual(['Uber']);
  });
  it('matches an amount exactly, with commas, decimals and Bangla digits', async () => {
    const { items } = await seeded();
    expect(q(items, { text: '250' })).toEqual(['Uber']); // ৳250, not ৳2,500
    expect(q(items, { text: '2,500' })).toEqual(['Agora']);
    expect(q(items, { text: '১২০০.৫০' })).toEqual(['Cafe']);
    expect(q(items, { text: '99999' })).toEqual([]);
  });
  it('needs every word to match', async () => {
    const { items } = await seeded();
    expect(q(items, { text: 'uber 250' })).toEqual(['Uber']);
    expect(q(items, { text: 'uber 2500' })).toEqual([]);
  });
  it('combines type, account, category and period', async () => {
    const { items } = await seeded();
    expect(q(items, { filter: 'income' })).toHaveLength(1);
    expect(q(items, { accountId: 'bank' })).toHaveLength(2); // the salary and the transfer out of the bank
    expect(q(items, { accountId: 'cash' }).length).toBe(3); // two cash expenses and the transfer into cash
    expect(q(items, { categoryId: 'dining' })).toEqual(['Cafe']);
    expect(q(items, { period: 'this_month' })).not.toContain('Cafe');
    expect(q(items, { period: 'last_30_days' })).not.toContain('Cafe');
    expect(q(items, { period: 'this_month', filter: 'expenses', text: 'agora' })).toEqual(['Agora']);
  });
  it('an empty query returns everything, newest first', async () => {
    const { items } = await seeded();
    expect(q(items, {})).toHaveLength(5);
    expect(q(items, { text: '   ' })).toHaveLength(5);
    expect(items[0]!.transaction.localDate >= items[1]!.transaction.localDate).toBe(true);
  });
  it('counts only the optional filters', () => {
    expect(activeFilterCount({ text: 'x', filter: 'income' })).toBe(0);
    expect(activeFilterCount({ accountId: 'a', categoryId: 'c', period: 'this_month' })).toBe(3);
    expect(activeFilterCount({ period: 'all' })).toBe(0);
  });
});

describe('editing and deleting saved transactions', () => {
  it('edits through a draft, with the same corrections and validation as capture', async () => {
    const { repo, svc } = await seeded();
    const [uber] = (await repo.listTransactions(USER)).filter((t) => t.merchantName === 'Uber');
    const data = { accounts, categories, people: [], transactions: [] };
    const draft = reviseDraft(draftFromTransaction(uber!), { amountMinor: 30_000, categoryId: 'transport' }, data);
    expect(validateDraft(draft, USER, data)).toEqual([]);
    const saved = await svc.update(USER, uber!.id, finalizeDraft(draft)!);
    expect(saved).toMatchObject({ amountMinor: 30_000, categoryId: 'transport', version: 2 });
    expect(saved.id).toBe(uber!.id);
  });
  it('refuses an edit that makes it invalid, and leaves the original untouched', async () => {
    const { repo, svc } = await seeded();
    const [uber] = (await repo.listTransactions(USER)).filter((t) => t.merchantName === 'Uber');
    await expect(svc.update(USER, uber!.id, { accountId: 'nope' })).rejects.toThrow();
    expect((await repo.getTransaction(USER, uber!.id))!.accountId).toBe('bkash');
  });
  it('deletes softly and restores, keeping the audit trail', async () => {
    const { repo, svc } = await seeded();
    const [uber] = (await repo.listTransactions(USER)).filter((t) => t.merchantName === 'Uber');
    await svc.remove(USER, uber!.id);
    expect((await repo.getTransaction(USER, uber!.id))?.deletedAt).toBeTruthy();
    expect(describeTransactions(await repo.listTransactions(USER), accounts, categories).some((i) => i.title === 'Uber')).toBe(false);
    const back = await svc.restore(USER, uber!.id);
    expect(back.deletedAt).toBeNull();
    expect(describeTransactions(await repo.listTransactions(USER), accounts, categories).some((i) => i.title === 'Uber')).toBe(true);
    const audit = repo.audit.filter((a) => a.entityId === uber!.id).map((a) => a.action);
    expect(audit).toEqual(['create', 'delete', 'update']);
  });
  it('restoring something that is not deleted is a no-op', async () => {
    const { repo, svc } = await seeded();
    const [any] = await repo.listTransactions(USER);
    expect((await svc.restore(USER, any!.id)).version).toBe(any!.version);
  });
});
