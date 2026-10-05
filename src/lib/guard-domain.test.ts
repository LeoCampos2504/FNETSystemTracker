import { describe, expect, it } from 'vitest';
import { dayKind, guardSummary, isMonday, mondayOf, monthRange, weekDays } from './guard-domain';

describe('guard duty rules', () => {
  it('finds Mondays and the seven days of a week', () => {
    expect(isMonday('2026-10-05')).toBe(true);
    expect(isMonday('2026-10-06')).toBe(false);
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(weekDays('2026-10-05')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
  it('lets a holiday outrank the weekday', () => {
    const holidays = new Set(['2026-10-12', '2026-10-10']);
    expect(dayKind('2026-10-12', holidays)).toBe('FERIADO');
    expect(dayKind('2026-10-10', holidays)).toBe('FERIADO');
    expect(dayKind('2026-10-11', holidays)).toBe('DOMINGO');
    expect(dayKind('2026-10-13', holidays)).toBe('HABIL');
  });
  it('counts guard days by kind inside the month and credits crews with off-hours hours', () => {
    const rows = guardSummary(
      [{ technician: 'Chaves', weekStart: '2026-09-28' }, { technician: 'chaves ', weekStart: '2026-10-05' }, { technician: 'Yareco M', weekStart: '2026-10-26' }],
      ['2026-10-12'],
      [{ technicians: ['CHAVES', 'Yareco M'], hours: 2.5 }, { technicians: ['Chaves'], hours: null }],
      '2026-10',
    );
    const chaves = rows.find((row) => row.technician === 'Chaves')!;
    // Week of 28/09 gives 1-4 October (Thu-Sun), week of 5/10 gives 5-11 October.
    expect(chaves).toMatchObject({ weeks: 2, days: 11, saturdays: 2, sundays: 2, holidays: 0 });
    expect(chaves.weekdays).toBe(7);
    expect(chaves).toMatchObject({ tasks: 2, hours: 2.5 });
    const yareco = rows.find((row) => row.technician === 'Yareco M')!;
    // Week of 26/10 runs to 1/11: only 26-31 October count; the holiday does not fall in it.
    expect(yareco).toMatchObject({ weeks: 1, days: 6, weekdays: 5, saturdays: 1, sundays: 0, tasks: 1, hours: 2.5 });
  });
  it('counts the Monday holiday of a guard week once', () => {
    const [row] = guardSummary([{ technician: 'A', weekStart: '2026-10-12' }], ['2026-10-12'], [], '2026-10');
    expect(row).toMatchObject({ days: 7, holidays: 1, weekdays: 4, saturdays: 1, sundays: 1 });
  });
});
