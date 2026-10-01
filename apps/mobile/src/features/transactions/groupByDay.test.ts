import { describe, expect, it } from 'vitest';
import type { RecentItem } from '@nomi/core';
import { groupByDay } from './groupByDay';

const item = (id: string, localDate: string) => ({ transaction: { id, localDate } }) as unknown as RecentItem;

describe('groupByDay', () => {
  it('groups consecutive items by date and keeps order', () => {
    const g = groupByDay([item('a', '2025-03-15'), item('b', '2025-03-15'), item('c', '2025-03-14')]);
    expect(g.map((s) => [s.date, s.data.map((d) => d.transaction.id)])).toEqual([['2025-03-15', ['a', 'b']], ['2025-03-14', ['c']]]);
  });
  it('handles an empty list', () => { expect(groupByDay([])).toEqual([]); });
});
