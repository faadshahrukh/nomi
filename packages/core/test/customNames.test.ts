import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, RuleBasedInterpreter, buildDemoData, captureText, type Category, type LedgerSnapshot } from '../src';

const demo = buildDemoData('2025-03-15');
const pets: Category = { id: 'cat.u.pets', userId: demo.profile.userId, parentId: null, name: 'Pets', kind: 'expense', archivedAt: null };
const vet: Category = { id: 'cat.u.vet', userId: demo.profile.userId, parentId: 'cat.u.pets', name: 'Vet visit', kind: 'expense', archivedAt: null };
const snapshot: LedgerSnapshot = { ...demo, categories: [...DEFAULT_CATEGORIES, pets, vet] };
const run = (text: string, s = snapshot) => captureText({ text, source: 'text', snapshot: s, interpreter: new RuleBasedInterpreter(), now: new Date('2025-03-15T10:00:00Z') });

describe('categories you create are understood', () => {
  it('maps a message that names your own category', async () => {
    const o = await run('Spent 800 on Pets');
    if (o.status !== 'ready') throw new Error(o.status);
    expect(o.proposals[0]!.editable).toMatchObject({ amountMinor: 80_000, categoryId: 'cat.u.pets' });
  });
  it('prefers the longest name, and matches whole words only', async () => {
    const o = await run('Paid 1500 for the vet visit for my dog');
    if (o.status !== 'ready') throw new Error(o.status);
    expect(o.proposals[0]!.editable.categoryId).toBe('cat.u.vet');
    const none = await run('Spent 300 on carpets'); // "carpets" contains "pets" but is not it
    expect('proposals' in none ? none.proposals[0]?.editable.categoryId ?? null : null).not.toBe('cat.u.pets');
  });
  it('does not use an archived category', async () => {
    const o = await run('Spent 800 on Pets', { ...snapshot, categories: [...DEFAULT_CATEGORIES, { ...pets, archivedAt: 'x' }] });
    expect('proposals' in o ? o.proposals[0]?.editable.categoryId ?? null : null).toBeNull();
  });
});

describe('a person you have not saved yet', () => {
  it.each([['Lent Zubair 500', 'debt', 'lent'], ['Borrowed 2000 from Zubair', 'debt', 'borrowed']])('%s asks who it is instead of treating it as an expense', async (text, type) => {
    const o = await run(text);
    if (o.status !== 'needs_clarification') throw new Error(o.status);
    expect(o.clarification.field).toBe('person');
    expect(o.proposals[0]!.editable.type).toBe(type);
  });
  it('understands a repayment from someone new', async () => {
    const o = await run('Zubair paid me back 1000');
    if (o.status !== 'needs_clarification') throw new Error(o.status);
    expect(o.clarification.field).toBe('person');
    expect(o.proposals[0]!.editable).toMatchObject({ type: 'repayment', amountMinor: 100_000 });
  });
  it('does not mistake pronouns or ordinary words for a person', async () => {
    const o = await run('Lent me 500 to a friend');
    expect('proposals' in o ? o.proposals[0]?.editable.type : null).not.toBe('debt');
    expect((await run('Spent 450 on lunch')).status).toBe('ready');
  });
  it('still resolves people you have saved', async () => {
    const o = await run('Lent Rahim 3000');
    if (o.status !== 'ready') throw new Error(o.status);
    expect(o.proposals[0]!.editable).toMatchObject({ type: 'debt', counterpartyId: 'demo-p-rahim' });
  });
});
