import { describe, expect, it } from 'vitest';
import { glyphFor, tileColors } from './glyphs';
import { darkColors, lightColors } from '../design/tokens';

describe('glyphs', () => {
  it('picks the most specific category match, then the family, then a default', () => {
    expect(glyphFor('expense', 'cat.food.groceries')).toEqual({ icon: 'cart', tone: 'Mint' });
    expect(glyphFor('expense', 'cat.food.dining')).toEqual({ icon: 'utensils', tone: 'Lav' }); // falls to the Food family
    expect(glyphFor('expense', 'cat.bills.electricity').icon).toBe('bolt');
    expect(glyphFor('expense', 'cat.bills.water').icon).toBe('receipt');
    expect(glyphFor('expense', 'cat.transport.ride_share').icon).toBe('car');
    expect(glyphFor('expense', 'cat.unknown_custom')).toEqual({ icon: 'tag', tone: 'Sand' });
    expect(glyphFor('expense', null)).toEqual({ icon: 'tag', tone: 'Sand' });
  });
  it('does not confuse similar ids (cat.foodies is not Food)', () => { expect(glyphFor('expense', 'cat.foodies').icon).toBe('tag'); });
  it('uses the transaction type for money that is not an ordinary expense', () => {
    expect(glyphFor('income', 'cat.income.salary').icon).toBe('arrowDown');
    expect(glyphFor('transfer', null).icon).toBe('swap');
    expect(glyphFor('debt', null).icon).toBe('users');
    expect(glyphFor('goal_contribution', null).icon).toBe('wallet');
  });
  it('resolves tile colours in both themes', () => {
    expect(tileColors(lightColors, 'Mint')).toEqual({ bg: lightColors.tileMint, fg: lightColors.onTileMint });
    expect(tileColors(darkColors, 'Rose').fg).toBe(darkColors.onTileRose);
  });
});
