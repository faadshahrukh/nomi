import { describe, expect, it } from 'vitest';
import { monthRangeLabel, pastDayLabel, shortDate, upcomingLabel } from './format';

describe('date labels', () => {
  it('labels past days', () => {
    expect(pastDayLabel('2025-03-15', '2025-03-15')).toBe('Today');
    expect(pastDayLabel('2025-03-14', '2025-03-15')).toBe('Yesterday');
    expect(pastDayLabel('2025-03-01', '2025-03-15')).toBe('1 Mar');
    expect(pastDayLabel('2024-12-30', '2025-01-02')).toBe('30 Dec 2024');
  });
  it('labels upcoming days', () => {
    expect(upcomingLabel('2025-03-15', '2025-03-15')).toBe('Today');
    expect(upcomingLabel('2025-03-16', '2025-03-15')).toBe('Tomorrow');
    expect(upcomingLabel('2025-03-18', '2025-03-15')).toBe('In 3 days · 18 Mar');
    expect(upcomingLabel('2025-03-31', '2025-03-15')).toBe('In 16 days · 31 Mar');
  });
  it('formats month ranges across a year boundary and for one month', () => {
    expect(monthRangeLabel(['2025-02', '2025-01', '2024-12'])).toBe('Dec–Feb');
    expect(monthRangeLabel(['2025-02'])).toBe('February');
    expect(shortDate('2025-03-05', '2025-03-15')).toBe('5 Mar');
  });
});
