import { describe, expect, it } from 'vitest';
import { daysBetween, dayKind, guardSummary, mondayOf, monthRange, validPeriod, weekdayName } from './guard-domain';

describe('guard duty rules', () => {
  it('lists the days of any range, not only Monday to Sunday', () => {
    expect(daysBetween('2026-10-07', '2026-10-09')).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
    expect(daysBetween('2026-10-09', '2026-10-07')).toEqual([]);
    expect(daysBetween('2026-12-30', '2027-01-02')).toHaveLength(4);
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(weekdayName('2026-10-07')).toBe('miércoles');
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
  it('accepts periods that start on any day but not backwards or longer than three months', () => {
    expect(validPeriod('2026-10-07', '2026-10-14')).toBe(true);
    expect(validPeriod('2026-10-07', '2026-10-07')).toBe(true);
    expect(validPeriod('2026-10-08', '2026-10-07')).toBe(false);
    expect(validPeriod('2026-01-01', '2026-06-30')).toBe(false);
  });
  it('lets a holiday outrank the weekday', () => {
    const holidays = new Set(['2026-10-12', '2026-10-10']);
    expect(dayKind('2026-10-12', holidays)).toBe('FERIADO');
    expect(dayKind('2026-10-10', holidays)).toBe('FERIADO');
    expect(dayKind('2026-10-11', holidays)).toBe('DOMINGO');
    expect(dayKind('2026-10-13', holidays)).toBe('HABIL');
  });
  it('counts working and non-working guard days inside the month and credits crews with off-hours hours', () => {
    const rows = guardSummary(
      [{ technician: 'Chaves', from: '2026-09-30', to: '2026-10-07' }, { technician: 'chaves ', from: '2026-10-07', to: '2026-10-14' }, { technician: 'Yareco M', from: '2026-10-28', to: '2026-11-04' }],
      ['2026-10-12'],
      [{ technicians: ['CHAVES', 'Yareco M'], hours: 2.5 }, { technicians: ['Chaves'], hours: null }],
      '2026-10',
    );
    const chaves = rows.find((row) => row.technician === 'Chaves')!;
    // 1-14 October (the 7th is in both periods and counts once): Sat 3, Sun 4, Sat 10, Sun 11 and the holiday Mon 12.
    expect(chaves).toMatchObject({ periods: 2, days: 14, nonWorking: 5, weekdays: 9, tasks: 2, hours: 2.5 });
    const yareco = rows.find((row) => row.technician === 'Yareco M')!;
    // 28-31 October only: Wed to Sat, so a single non-working day.
    expect(yareco).toMatchObject({ periods: 1, days: 4, weekdays: 3, nonWorking: 1, tasks: 1, hours: 2.5 });
  });
  it('counts a holiday that falls on a weekend once', () => {
    const [row] = guardSummary([{ technician: 'A', from: '2026-10-10', to: '2026-10-11' }], ['2026-10-10'], [], '2026-10');
    expect(row).toMatchObject({ days: 2, nonWorking: 2, weekdays: 0 });
  });
});
