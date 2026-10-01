import { DEFAULT_CATEGORIES } from '../defaultCategories';
import type { LedgerRepository } from '../repository';
import { buildDemoData, DEMO_USER_ID } from './demoData';
import type { LocalDate } from '../dates';

/** Writes the system categories. Safe to run repeatedly. Used for real and demo databases alike. */
export async function seedSystemCategories(repo: LedgerRepository, userId: string): Promise<void> {
  await repo.atomic(async () => { for (const c of DEFAULT_CATEGORIES) await repo.putCategory(userId, c); });
}

/** Loads demo data into an EMPTY demo database. Does nothing if demo data is already there. Returns true if it seeded. */
export async function seedDemoData(repo: LedgerRepository, today: LocalDate): Promise<boolean> {
  if (await repo.getProfile(DEMO_USER_ID)) return false;
  const d = buildDemoData(today);
  await repo.atomic(async () => {
    for (const c of DEFAULT_CATEGORIES) await repo.putCategory(DEMO_USER_ID, c);
    await repo.putProfile(DEMO_USER_ID, d.profile);
    for (const a of d.accounts) await repo.putAccount(DEMO_USER_ID, a);
    for (const p of d.people) await repo.putPerson(DEMO_USER_ID, p);
    for (const g of d.goals) await repo.putGoal(DEMO_USER_ID, g);
    for (const b of d.budgets) await repo.putBudget(DEMO_USER_ID, b);
    for (const r of d.recurringRules) await repo.putRecurringRule(DEMO_USER_ID, r);
    for (const t of d.transactions) await repo.insertTransaction(DEMO_USER_ID, t);
  });
  return true;
}
