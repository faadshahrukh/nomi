import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError, accountBalances, incomeTotal, netSpending, personBalances, spendingByRootCategory, spendingInCategory, ConflictError } from '../src';
import { OTHER, USER, categories, expense, setup } from './fixtures';

const all = { from: '2025-03-01', to: '2025-03-31' };
const balances = async (repo: ReturnType<typeof setup>['repo']) =>
  accountBalances({ accounts: repo.accounts, transactions: await repo.listTransactions(USER) });

describe('transaction lifecycle', () => {
  it('creates an expense, reduces the account balance, and writes an audit entry', async () => {
    const { repo, svc } = setup();
    const t = await svc.create(USER, expense(45_000, '2025-03-15', { categoryId: 'dining' }));
    expect((await balances(repo)).get('cash')).toBe(500_000 - 45_000);
    expect(repo.audit).toHaveLength(1);
    expect(repo.audit[0]).toMatchObject({ action: 'create', entityId: t.id });
  });

  it('edits a transaction field-by-field and the balance follows', async () => {
    const { repo, svc } = setup();
    const t = await svc.create(USER, expense(45_000, '2025-03-15'));
    const edited = await svc.update(USER, t.id, { amountMinor: 55_000, accountId: 'bank', categoryId: 'dining' });
    expect(edited.version).toBe(2);
    const b = await balances(repo);
    expect(b.get('cash')).toBe(500_000);          // moved off cash
    expect(b.get('bank')).toBe(10_000_000 - 55_000);
    expect(repo.audit.at(-1)!.changedFields.sort()).toEqual(['accountId', 'amountMinor', 'categoryId']);
  });

  it('deletes softly: balance restored, row kept for audit', async () => {
    const { repo, svc } = setup();
    const t = await svc.create(USER, expense(45_000, '2025-03-15'));
    await svc.remove(USER, t.id);
    expect((await balances(repo)).get('cash')).toBe(500_000);
    expect(repo.transactions[0]!.deletedAt).not.toBeNull();
    await expect(svc.update(USER, t.id, { amountMinor: 1 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects invalid input without persisting anything', async () => {
    const { repo, svc } = setup();
    await expect(svc.create(USER, expense(0, '2025-03-15'))).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.create(USER, expense(100.5, '2025-03-15'))).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.create(USER, expense(100, '2025-02-30'))).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.create(USER, expense(100, '2025-03-15', { accountId: 'nope' }))).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.create(USER, expense(100, '2025-03-15', { categoryId: 'salary' }))).rejects.toBeInstanceOf(ValidationError); // income category on expense
    await expect(svc.create(USER, expense(100, '2025-03-15', { currency: 'USD' }))).rejects.toBeInstanceOf(ValidationError);
    expect(repo.transactions).toHaveLength(0);
    expect(repo.audit).toHaveLength(0);
  });

  it('does not retain raw input unless the user opted in', async () => {
    const { repo, svc } = setup();
    await svc.create(USER, expense(100, '2025-03-15', { rawInput: 'spent 1 taka on gum' }));
    expect(repo.transactions[0]!.rawInput).toBeNull();
  });

  it('detects concurrent modification', async () => {
    const { repo, svc } = setup();
    const t = await svc.create(USER, expense(100, '2025-03-15'));
    await expect(repo.updateTransaction(USER, { ...t, amountMinor: 5 }, 99)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('transfers, income and non-spending types', () => {
  it('moves money between accounts without counting as spending or income', async () => {
    const { repo, svc } = setup();
    await svc.create(USER, { type: 'transfer', amountMinor: 1_000_000, currency: 'BDT', localDate: '2025-03-10', source: 'text', accountId: 'bank', toAccountId: 'bkash' });
    const b = await balances(repo);
    expect(b.get('bank')).toBe(9_000_000);
    expect(b.get('bkash')).toBe(1_200_000);
    const txs = await repo.listTransactions(USER);
    expect(netSpending(txs, all)).toBe(0);
    expect(incomeTotal(txs, all)).toBe(0);
  });
  it('rejects a transfer to the same account or without a destination', async () => {
    const { svc } = setup();
    const base = { type: 'transfer' as const, amountMinor: 100, currency: 'BDT', localDate: '2025-03-10', source: 'text' as const, accountId: 'bank' };
    await expect(svc.create(USER, { ...base, toAccountId: 'bank' })).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.create(USER, base)).rejects.toBeInstanceOf(ValidationError);
  });
  it('records income into an account, outside spending', async () => {
    const { repo, svc } = setup();
    await svc.create(USER, { type: 'income', amountMinor: 12_000_000, currency: 'BDT', localDate: '2025-03-01', source: 'text', accountId: 'bank', categoryId: 'salary' });
    const txs = await repo.listTransactions(USER);
    expect((await balances(repo)).get('bank')).toBe(22_000_000);
    expect(incomeTotal(txs, all)).toBe(12_000_000);
    expect(netSpending(txs, all)).toBe(0);
  });
  it('treats savings and goal contributions as transfers, not spending', async () => {
    const { repo, svc } = setup();
    await svc.create(USER, { type: 'savings_contribution', amountMinor: 500_000, currency: 'BDT', localDate: '2025-03-05', source: 'manual', accountId: 'bank', toAccountId: 'sav' });
    expect((await balances(repo)).get('sav')).toBe(500_000);
    expect(netSpending(await repo.listTransactions(USER), all)).toBe(0);
    await expect(svc.create(USER, { type: 'goal_contribution', amountMinor: 1, currency: 'BDT', localDate: '2025-03-05', source: 'manual', accountId: 'bank', toAccountId: 'sav' })).rejects.toBeInstanceOf(ValidationError); // goal required
  });
  it('refunds return money and reduce category spending', async () => {
    const { repo, svc } = setup();
    await svc.create(USER, expense(300_000, '2025-03-02', { categoryId: 'shopping', accountId: 'bank' }));
    await svc.create(USER, { type: 'refund', amountMinor: 100_000, currency: 'BDT', localDate: '2025-03-08', source: 'manual', accountId: 'bank', categoryId: 'shopping' });
    const txs = await repo.listTransactions(USER);
    expect(netSpending(txs, all)).toBe(200_000);
    expect((await balances(repo)).get('bank')).toBe(10_000_000 - 200_000);
  });
});

describe('totals and categories', () => {
  it('rolls sub-categories up to their parent and supports category subtree queries', async () => {
    const { repo, svc } = setup();
    await svc.create(USER, expense(325_000, '2025-03-03', { categoryId: 'groceries' }));
    await svc.create(USER, expense(85_000, '2025-03-04', { categoryId: 'dining' }));
    await svc.create(USER, expense(68_000, '2025-03-05', { categoryId: 'rideshare' }));
    await svc.create(USER, expense(10_000, '2025-04-01', { categoryId: 'dining' })); // outside range
    const txs = await repo.listTransactions(USER);
    const byRoot = spendingByRootCategory(txs, categories, all);
    expect(byRoot.get('food')).toBe(410_000);
    expect(byRoot.get('transport')).toBe(68_000);
    expect(spendingInCategory(txs, categories, 'food', all)).toBe(410_000);
    expect(spendingInCategory(txs, categories, 'dining', all)).toBe(85_000);
    expect(netSpending(txs, all)).toBe(478_000);
  });
});

describe('shared expenses and people', () => {
  it('"Rahim paid 1500, my share 750": spending is my share, no account debited, I owe Rahim', async () => {
    const { repo, svc } = setup();
    await svc.create(USER, { type: 'expense', amountMinor: 150_000, currency: 'BDT', localDate: '2025-03-12', source: 'text', categoryId: 'dining', accountId: null,
      paidBy: 'rahim', splits: [{ personId: 'me', amountMinor: 75_000 }, { personId: 'rahim', amountMinor: 75_000 }] });
    const txs = await repo.listTransactions(USER);
    expect(netSpending(txs, all)).toBe(75_000);
    expect(personBalances(txs).get('rahim')).toBe(-75_000);
    expect((await balances(repo)).get('cash')).toBe(500_000);
  });
  it('when I pay and split, my account drops by the total but spending is my share; friend owes me', async () => {
    const { repo, svc } = setup();
    await svc.create(USER, { type: 'expense', amountMinor: 100_000, currency: 'BDT', localDate: '2025-03-12', source: 'manual', categoryId: 'dining', accountId: 'cash',
      splits: [{ personId: 'me', amountMinor: 50_000 }, { personId: 'karim', amountMinor: 50_000 }] });
    const txs = await repo.listTransactions(USER);
    expect((await balances(repo)).get('cash')).toBe(400_000);
    expect(netSpending(txs, all)).toBe(50_000);
    expect(personBalances(txs).get('karim')).toBe(50_000);
  });
  it('a settlement repayment clears the balance without touching spending', async () => {
    const { repo, svc } = setup();
    await svc.create(USER, { type: 'expense', amountMinor: 100_000, currency: 'BDT', localDate: '2025-03-12', source: 'manual', categoryId: 'dining', accountId: 'cash',
      splits: [{ personId: 'me', amountMinor: 50_000 }, { personId: 'karim', amountMinor: 50_000 }] });
    await svc.create(USER, { type: 'repayment', amountMinor: 50_000, currency: 'BDT', localDate: '2025-03-14', source: 'manual', accountId: 'cash', counterpartyId: 'karim', repaymentDirection: 'received' });
    const txs = await repo.listTransactions(USER);
    expect(personBalances(txs).get('karim')).toBe(0);
    expect((await balances(repo)).get('cash')).toBe(450_000);
    expect(netSpending(txs, all)).toBe(50_000);
  });
  it('lending is not spending; splits must add up', async () => {
    const { repo, svc } = setup();
    await svc.create(USER, { type: 'debt', amountMinor: 200_000, currency: 'BDT', localDate: '2025-03-12', source: 'manual', accountId: 'cash', counterpartyId: 'rahim', debtDirection: 'lent' });
    const txs = await repo.listTransactions(USER);
    expect(netSpending(txs, all)).toBe(0);
    expect(personBalances(txs).get('rahim')).toBe(200_000);
    await expect(svc.create(USER, { type: 'expense', amountMinor: 100_000, currency: 'BDT', localDate: '2025-03-12', source: 'manual', accountId: 'cash',
      splits: [{ personId: 'me', amountMinor: 60_000 }, { personId: 'karim', amountMinor: 50_000 }] })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('permission boundaries', () => {
  it('never exposes or mutates another user\'s transactions', async () => {
    const { repo, svc } = setup();
    const t = await svc.create(USER, expense(100, '2025-03-15'));
    expect(await repo.listTransactions(OTHER)).toEqual([]);
    expect(await repo.getTransaction(OTHER, t.id)).toBeNull();
    await expect(svc.update(OTHER, t.id, { amountMinor: 1 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.remove(OTHER, t.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(repo.insertTransaction(OTHER, { ...t, id: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.transactions[0]!.amountMinor).toBe(100);
  });
  it('cannot post to another user\'s account', async () => {
    const { svc } = setup();
    await expect(svc.create(OTHER, expense(100, '2025-03-15'))).rejects.toBeInstanceOf(ValidationError); // account 'cash' belongs to USER
  });
});
