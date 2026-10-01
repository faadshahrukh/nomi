import { describe, expect, it } from 'vitest';
import { InMemoryLedgerRepository, buildExport, exportFileName, transactionsToCsv, EXPORT_FORMAT } from '../src';
import { USER, OTHER, accounts, categories, expense, setup } from './fixtures';
import { sqlRepo } from './nodeSqlite';

const profile = { userId: USER, country: 'BD', currency: 'BDT' as const, timezone: 'Asia/Dhaka', locale: 'en' as const, confirmationPref: 'always_confirm' as const, highImpactMinor: 1_000_000,
  safetyBufferMinor: 0, retainRawInput: false, defaultAccountId: null, aiProcessing: true, displayName: 'Rafi', primaryGoals: [], onboardedAt: null };

describe('export', () => {
  it('contains everything the user owns, including deleted entries and the audit trail', async () => {
    const { repo, svc } = setup();
    const a = await svc.create(USER, expense(25_000, '2025-03-10', { merchantName: 'Uber', categoryId: 'rideshare' }));
    await svc.create(USER, expense(10_000, '2025-03-11'));
    await svc.remove(USER, a.id);
    const out = buildExport({ profile, accounts: repo.accounts, categories: [...categories, { id: 'mine', userId: USER, parentId: null, name: 'Pets', kind: 'expense', archivedAt: null }],
      people: repo.people, goals: [], recurringRules: [], budgets: [], transactions: await repo.listTransactions(USER, { includeDeleted: true }), audit: await repo.listAudit(USER) }, new Date('2025-03-15T08:00:00Z'));
    expect(out).toMatchObject({ format: EXPORT_FORMAT, version: 1, exportedAt: '2025-03-15T08:00:00.000Z' });
    expect(out.transactions).toHaveLength(2);
    expect(out.transactions.some((t) => t.deletedAt)).toBe(true);
    expect(out.audit.map((e) => e.action)).toEqual(['create', 'create', 'delete']);
    expect(out.categories.map((c) => c.id)).toEqual(['mine']); // shared system categories are not the user's data
    expect(out.transactions.find((t) => t.merchantName === 'Uber')!.amountMinor).toBe(25_000); // exact minor units
    expect(JSON.parse(JSON.stringify(out))).toEqual(out); // plain JSON
    expect(exportFileName(new Date('2025-03-15T08:00:00Z'), 'csv')).toBe('nomi-export-2025-03-15.csv');
  });
});

describe('CSV', () => {
  it('writes decimals, resolves names, and skips deleted rows', async () => {
    const { repo, svc } = setup();
    await svc.create(USER, expense(120_050, '2025-03-10', { merchantName: 'Agora', categoryId: 'groceries', notes: 'weekly, "big" shop' }));
    const gone = await svc.create(USER, expense(1, '2025-03-11'));
    await svc.remove(USER, gone.id);
    const csv = transactionsToCsv(await repo.listTransactions(USER, { includeDeleted: true }), repo.accounts, repo.categories, repo.people);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('Date,Type,Amount,Currency,Category,Merchant,Account,To account,Paid by,My share,Person,Note');
    expect(lines[1]).toBe('2025-03-10,expense,1200.50,BDT,Groceries,Agora,Cash,,Me,,,"weekly, ""big"" shop"');
  });
  it('makes spreadsheet formulas inert', async () => {
    const { repo, svc } = setup();
    await svc.create(USER, expense(100, '2025-03-10', { merchantName: '=HYPERLINK("http://evil")', notes: '+1+1' }));
    const csv = transactionsToCsv(await repo.listTransactions(USER), repo.accounts, repo.categories);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain(",'+1+1");
  });
});

describe.each([['in-memory', async () => new InMemoryLedgerRepository()], ['sqlite', sqlRepo]] as const)('%s deleteAllUserData', (_n, make) => {
  it('removes one user’s data from every table and leaves others and system categories alone', async () => {
    const repo = await make();
    for (const who of [USER, OTHER]) {
      await repo.putProfile(who, { ...profile, userId: who });
      await repo.putAccount(who, { ...accounts[0]!, id: `cash-${who}`, userId: who });
    }
    for (const c of categories) await repo.putCategory(USER, { ...c });
    await repo.putCategory(USER, { id: 'mine', userId: USER, parentId: null, name: 'Pets', kind: 'expense', archivedAt: null });
    await repo.putBudget(USER, { id: 'b', userId: USER, categoryId: null, amountMinor: 1, currency: 'BDT' });
    await repo.dismissSignal(USER, 'k', 'now');
    await repo.deleteAllUserData(USER);
    expect(await repo.getProfile(USER)).toBeNull();
    expect(await repo.listAccounts(USER)).toEqual([]);
    expect(await repo.listBudgets(USER)).toEqual([]);
    expect(await repo.listDismissedSignals(USER)).toEqual([]);
    expect((await repo.listCategories(USER)).some((c) => c.id === 'mine')).toBe(false);
    expect((await repo.listCategories(USER)).some((c) => c.id === 'food')).toBe(true);
    expect(await repo.getProfile(OTHER)).not.toBeNull();
    expect(await repo.listAccounts(OTHER)).toHaveLength(1);
  });
});
