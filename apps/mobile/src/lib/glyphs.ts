import type { IconName } from '../components/ui/Icon';
import type { ColorTokens } from '../design/tokens';

export type TileTone = 'Mint' | 'Lav' | 'Sky' | 'Peach' | 'Sand' | 'Rose';
export interface Glyph { icon: IconName; tone: TileTone }

const BY_CATEGORY: Array<[string, Glyph]> = [
  ['cat.food.groceries', { icon: 'cart', tone: 'Mint' }],
  ['cat.food.delivery', { icon: 'bag', tone: 'Peach' }],
  ['cat.food.coffee', { icon: 'utensils', tone: 'Sand' }],
  ['cat.food', { icon: 'utensils', tone: 'Lav' }],
  ['cat.transport', { icon: 'car', tone: 'Sky' }],
  ['cat.bills.rent', { icon: 'home', tone: 'Mint' }],
  ['cat.bills.electricity', { icon: 'bolt', tone: 'Lav' }],
  ['cat.bills.internet', { icon: 'wifi', tone: 'Sky' }],
  ['cat.bills', { icon: 'receipt', tone: 'Sand' }],
  ['cat.shopping', { icon: 'bag', tone: 'Rose' }],
  ['cat.health', { icon: 'heart', tone: 'Rose' }],
  ['cat.entertainment', { icon: 'play', tone: 'Lav' }],
  ['cat.education', { icon: 'book', tone: 'Sky' }],
  ['cat.family', { icon: 'users', tone: 'Peach' }],
  ['cat.finance', { icon: 'bank', tone: 'Sand' }],
  ['cat.travel', { icon: 'plane', tone: 'Sky' }],
  ['cat.income', { icon: 'arrowDown', tone: 'Mint' }],
];

/**
 * The icon and pastel tone for a ledger line: by category when it has one (most specific match first), otherwise by type.
 * Presentation only. It never affects any figure.
 */
export function glyphFor(type: string, categoryId: string | null): Glyph {
  if (type === 'income' || type === 'refund') return { icon: 'arrowDown', tone: 'Mint' };
  if (type === 'transfer') return { icon: 'swap', tone: 'Sky' };
  if (type === 'savings_contribution' || type === 'goal_contribution') return { icon: 'wallet', tone: 'Mint' };
  if (type === 'debt' || type === 'repayment') return { icon: 'users', tone: 'Peach' };
  if (categoryId) for (const [prefix, g] of BY_CATEGORY) if (categoryId === prefix || categoryId.startsWith(prefix + '.')) return g;
  return { icon: 'tag', tone: 'Sand' };
}

export const tileColors = (c: ColorTokens, tone: TileTone): { bg: string; fg: string } =>
  ({ bg: c[`tile${tone}` as keyof ColorTokens], fg: c[`onTile${tone}` as keyof ColorTokens] });
