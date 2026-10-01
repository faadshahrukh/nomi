import type { Category } from './types';

/**
 * System categories from the product spec. Ids are stable strings so demo data, tests and future migrations can refer to them.
 * Users add and edit their own (userId set); these are shared and read-only.
 */
const TREE: Array<[string, string[]]> = [
  ['Food', ['Groceries', 'Dining', 'Coffee', 'Delivery']],
  ['Transport', ['Fuel', 'Ride share', 'Public transport', 'Parking']],
  ['Bills', ['Electricity', 'Internet', 'Mobile', 'Water', 'Rent']],
  ['Shopping', ['Clothing', 'Electronics', 'Household', 'Personal care']],
  ['Health', ['Medicine', 'Doctor', 'Fitness']],
  ['Entertainment', ['Movies', 'Games', 'Events', 'Streaming']],
  ['Education', ['Courses', 'Books', 'Tuition']],
  ['Family', ['Children', 'Parents', 'Gifts', 'Household support']],
  ['Finance', ['Fees', 'Interest', 'Loan payment']],
  ['Travel', ['Flights', 'Hotel', 'Local travel']],
  ['Other', ['Miscellaneous']],
];
const INCOME = ['Salary', 'Business', 'Freelance', 'Gift', 'Investment', 'Other income'];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const categoryId = (...path: string[]): string => 'cat.' + path.map(slug).join('.');

export const DEFAULT_CATEGORIES: Category[] = [
  ...TREE.flatMap(([parent, kids]) => [
    { id: categoryId(parent), userId: null, parentId: null, name: parent, kind: 'expense' as const, archivedAt: null },
    ...kids.map((k) => ({ id: categoryId(parent, k), userId: null, parentId: categoryId(parent), name: k, kind: 'expense' as const, archivedAt: null })),
  ]),
  ...INCOME.map((n) => ({ id: categoryId('income', n), userId: null, parentId: null, name: n, kind: 'income' as const, archivedAt: null })),
];
