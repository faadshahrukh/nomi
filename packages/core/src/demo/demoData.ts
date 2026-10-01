import { addDays, addMonths, daysInMonth, formatLocalDate, parseLocalDate, startOfMonth, type LocalDate } from '../dates';
import { DEFAULT_CATEGORIES, categoryId } from '../defaultCategories';
import type { Account, Budget, Goal, Person, Profile, RecurringRule, Transaction } from '../types';

/**
 * DEMO DATA. Invented for development and design review. It is generated relative to `today` so insights always have
 * history to work with, is deterministic (same input, same output), and lives in a separate demo database and user id so it
 * can never mix with a real user's records. The app shows a visible "Demo data" label whenever it is loaded.
 */
export const DEMO_USER_ID = 'demo-user';

export interface DemoData {
  profile: Profile; accounts: Account[]; people: Person[]; budgets: Budget[]; recurringRules: RecurringRule[];
  goals: Goal[]; transactions: Transaction[];
}

/** Small deterministic PRNG so demo amounts vary but never change between runs. */
function mulberry32(seed: number) {
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const C = {
  groceries: categoryId('Food', 'Groceries'), dining: categoryId('Food', 'Dining'), coffee: categoryId('Food', 'Coffee'),
  ride: categoryId('Transport', 'Ride share'), rent: categoryId('Bills', 'Rent'), internet: categoryId('Bills', 'Internet'),
  electricity: categoryId('Bills', 'Electricity'), clothing: categoryId('Shopping', 'Clothing'), streaming: categoryId('Entertainment', 'Streaming'),
  medicine: categoryId('Health', 'Medicine'), salary: categoryId('income', 'Salary'),
};

const A = { cash: 'demo-acc-cash', bank: 'demo-acc-bank', bkash: 'demo-acc-bkash', savings: 'demo-acc-savings' };
const bdt = (major: number) => Math.round(major * 100);

export function buildDemoData(today: LocalDate, timezone = 'Asia/Dhaka'): DemoData {
  const userId = DEMO_USER_ID;
  const rnd = mulberry32(20250315);
  const pick = (lo: number, hi: number, step = 10) => Math.round((lo + rnd() * (hi - lo)) / step) * step;

  const accounts: Account[] = [
    { id: A.cash, userId, name: 'Cash', type: 'cash', currency: 'BDT', aliases: ['cash', 'নগদ টাকা'], openingBalanceMinor: bdt(4000), includeInLiquid: true, archivedAt: null },
    { id: A.bank, userId, name: 'City Bank', type: 'bank', currency: 'BDT', aliases: ['bank', 'city'], openingBalanceMinor: bdt(15000), includeInLiquid: true, archivedAt: null },
    { id: A.bkash, userId, name: 'bKash', type: 'mobile_wallet', currency: 'BDT', aliases: ['bkash', 'বিকাশ'], openingBalanceMinor: bdt(8000), includeInLiquid: true, archivedAt: null },
    { id: A.savings, userId, name: 'Savings', type: 'savings', currency: 'BDT', aliases: ['savings'], openingBalanceMinor: bdt(40000), includeInLiquid: false, archivedAt: null },
  ];
  const people: Person[] = [{ id: 'demo-p-rahim', userId, name: 'Rahim' }, { id: 'demo-p-karim', userId, name: 'Karim' }];
  const goals: Goal[] = [
    { id: 'demo-goal-emergency', userId, name: 'Emergency fund', currency: 'BDT', targetMinor: bdt(300000), targetDate: null, monthlyContributionMinor: bdt(5000), openingSavedMinor: bdt(40000) },
    { id: 'demo-goal-trip', userId, name: "Cox's Bazar trip", currency: 'BDT', targetMinor: bdt(60000), targetDate: addMonths(startOfMonth(today), 5), monthlyContributionMinor: null, openingSavedMinor: bdt(10000) },
  ];
  const budgets: Budget[] = [
    { id: 'demo-b-all', userId, categoryId: null, amountMinor: bdt(80000), currency: 'BDT' },
    { id: 'demo-b-food', userId, categoryId: categoryId('Food'), amountMinor: bdt(18000), currency: 'BDT' },
    { id: 'demo-b-transport', userId, categoryId: categoryId('Transport'), amountMinor: bdt(6000), currency: 'BDT' },
    { id: 'demo-b-shopping', userId, categoryId: categoryId('Shopping'), amountMinor: bdt(8000), currency: 'BDT' },
  ];
  const anchorMonth = startOfMonth(addMonths(today, -4));
  const dayOf = (day: number) => addDays(anchorMonth, day - 1);
  const rules: RecurringRule[] = [
    { id: 'demo-r-rent', userId, name: 'Rent', type: 'expense', amountMinor: bdt(25000), currency: 'BDT', accountId: A.bank, categoryId: C.rent, frequency: 'monthly', interval: 1, anchorDate: dayOf(5), endDate: null, isBill: true, active: true },
    { id: 'demo-r-internet', userId, name: 'Internet', type: 'expense', amountMinor: bdt(1200), currency: 'BDT', accountId: A.bkash, categoryId: C.internet, frequency: 'monthly', interval: 1, anchorDate: dayOf(10), endDate: null, isBill: true, active: true },
    { id: 'demo-r-electricity', userId, name: 'Electricity', type: 'expense', amountMinor: bdt(2500), currency: 'BDT', accountId: A.bkash, categoryId: C.electricity, frequency: 'monthly', interval: 1, anchorDate: dayOf(18), endDate: null, isBill: true, active: true },
    { id: 'demo-r-streaming', userId, name: 'Streaming', type: 'expense', amountMinor: bdt(600), currency: 'BDT', accountId: A.bank, categoryId: C.streaming, frequency: 'monthly', interval: 1, anchorDate: dayOf(22), endDate: null, isBill: true, active: true },
  ];
  const profile: Profile = { userId, country: 'BD', currency: 'BDT', timezone, locale: 'mixed', confirmationPref: 'always_confirm', highImpactMinor: bdt(10000), safetyBufferMinor: bdt(5000), retainRawInput: false, defaultAccountId: A.cash };

  const txs: Transaction[] = [];
  let seq = 0;
  const add = (date: LocalDate, t: Partial<Transaction> & Pick<Transaction, 'type' | 'amountMinor'>) => {
    if (date > today) return;
    const source = t.source ?? (['text', 'voice', 'manual'] as const)[Math.floor(rnd() * 3)]!;
    txs.push({
      id: `demo-tx-${String(++seq).padStart(4, '0')}`, userId, currency: 'BDT', categoryId: null, merchantName: null, accountId: null, toAccountId: null,
      localDate: date, localTime: null, notes: null, paidBy: 'me', splits: null, counterpartyId: null, debtDirection: null, repaymentDirection: null,
      goalId: null, recurringRuleId: null, occurrenceDate: null, source, aiConfidence: source === 'manual' ? null : 0.95, rawInput: null,
      createdAt: `${date}T09:00:00.000Z`, updatedAt: `${date}T09:00:00.000Z`, deletedAt: null, version: 1, ...t,
    });
  };

  for (let k = 3; k >= 0; k--) {
    const first = startOfMonth(addMonths(today, -k));
    const { y, m } = parseLocalDate(first);
    const last = k === 0 ? parseLocalDate(today).d : daysInMonth(y, m);
    const on = (d: number) => formatLocalDate(y, m, Math.min(d, daysInMonth(y, m)));
    const current = k === 0;

    add(on(1), { type: 'income', amountMinor: bdt(95000), accountId: A.bank, categoryId: C.salary, merchantName: 'Employer', notes: 'Salary' });
    add(on(2), { type: 'transfer', amountMinor: bdt(5000), accountId: A.bank, toAccountId: A.cash, notes: 'ATM withdrawal' });
    add(on(3), { type: 'transfer', amountMinor: bdt(30000), accountId: A.bank, toAccountId: A.bkash });
    add(on(6), { type: 'savings_contribution', amountMinor: bdt(10000), accountId: A.bank, toAccountId: A.savings });
    add(on(6), { type: 'goal_contribution', amountMinor: bdt(5000), accountId: A.bank, toAccountId: A.savings, goalId: 'demo-goal-emergency' });

    for (const [rule, day, amount, merchant] of [[rules[0]!, 5, 25000, 'Landlord'], [rules[1]!, 10, 1200, 'Link3'], [rules[2]!, 18, pick(2200, 2900), 'DESCO'], [rules[3]!, 22, current ? 700 : 600, 'Streaming']] as const) {
      const date = on(day);
      add(date, { type: 'expense', amountMinor: bdt(amount), accountId: rule.accountId, categoryId: rule.categoryId, merchantName: merchant, recurringRuleId: rule.id, occurrenceDate: date, source: 'manual' });
    }

    for (let d = 1; d <= last; d++) {
      if (d % 4 === 2) add(on(d), { type: 'expense', amountMinor: bdt(pick(1500, 3200)), accountId: d % 8 === 2 ? A.bank : A.bkash, categoryId: C.groceries, merchantName: d % 8 === 2 ? 'Agora' : 'Shwapno' });
      if (d % 3 === 0) add(on(d), { type: 'expense', amountMinor: bdt(Math.round(pick(450, 1100) * (current ? 1.9 : 1))), accountId: A.bkash, categoryId: C.dining, merchantName: ['Pizza Hut', 'Kacchi Bhai', 'Cafe Aroma'][d % 3] });
      if (current && d % 6 === 1) add(on(d), { type: 'expense', amountMinor: bdt(pick(900, 1600)), accountId: A.bkash, categoryId: C.dining, merchantName: 'Foodpanda' });
      if (d % 5 === 1) add(on(d), { type: 'expense', amountMinor: bdt(pick(150, 250)), accountId: A.cash, categoryId: C.coffee, merchantName: 'Coffee' });
      if (d % 3 === 1) add(on(d), { type: 'expense', amountMinor: bdt(pick(250, 700)), accountId: A.bkash, categoryId: C.ride, merchantName: d % 2 ? 'Uber' : 'Pathao' });
    }
    add(on(12), { type: 'expense', amountMinor: bdt(pick(3000, 6000)), accountId: A.bank, categoryId: C.clothing, merchantName: 'Aarong' });
    if (k === 1) {
      add(on(15), { type: 'refund', amountMinor: bdt(800), accountId: A.bank, categoryId: C.clothing, merchantName: 'Aarong', notes: 'Returned item' });
      add(on(20), { type: 'debt', amountMinor: bdt(3000), accountId: A.bank, counterpartyId: 'demo-p-rahim', debtDirection: 'lent', notes: 'Lent to Rahim' });
      add(on(24), { type: 'expense', amountMinor: bdt(1500), accountId: null, paidBy: 'demo-p-rahim', categoryId: C.dining, merchantName: 'Dinner', splits: [{ personId: 'me', amountMinor: bdt(750) }, { personId: 'demo-p-rahim', amountMinor: bdt(750) }] });
    }
    if (k === 0) {
      add(on(3), { type: 'repayment', amountMinor: bdt(1000), accountId: A.bkash, counterpartyId: 'demo-p-rahim', repaymentDirection: 'received', notes: 'Rahim paid back part' });
      add(on(8), { type: 'expense', amountMinor: bdt(2400), accountId: A.bank, categoryId: C.dining, merchantName: 'Team dinner', splits: [{ personId: 'me', amountMinor: bdt(800) }, { personId: 'demo-p-karim', amountMinor: bdt(800) }, { personId: 'demo-p-rahim', amountMinor: bdt(800) }] });
      add(on(9), { type: 'expense', amountMinor: bdt(650), accountId: A.cash, categoryId: C.medicine, merchantName: 'Lazz Pharma' });
    }
  }
  txs.sort((a, b) => a.localDate.localeCompare(b.localDate) || a.id.localeCompare(b.id));
  return { profile, accounts, people, budgets, recurringRules: rules, goals, transactions: txs };
}

export { DEFAULT_CATEGORIES as DEMO_CATEGORIES };
