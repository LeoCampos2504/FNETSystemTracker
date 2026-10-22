import { describe, expect, it } from 'vitest';
import { daysBetween, dayKind, guardDailyCoverage, guardDays, guardIsCurrent, guardSummary, mondayOf, monthRange, newGuardWindow, validPeriod, weekdayName } from './guard-domain';

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
    expect(validPeriod('2026-10-07', '2026-10-07')).toBe(false);
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
    // 1-13 October: the 14th at 08:00 is the handover, not an eighth day.
    expect(chaves).toMatchObject({ periods: 2, days: 13, nonWorking: 5, weekdays: 8, tasks: 2, hours: 2.5 });
    const yareco = rows.find((row) => row.technician === 'Yareco M')!;
    // 28-31 October only: Wed to Sat, so a single non-working day.
    expect(yareco).toMatchObject({ periods: 1, days: 4, weekdays: 3, nonWorking: 1, tasks: 1, hours: 2.5 });
  });
  it('counts a holiday that falls on a weekend once', () => {
    const [row] = guardSummary([{ technician: 'A', from: '2026-10-10', to: '2026-10-12' }], ['2026-10-10'], [], '2026-10');
    expect(row).toMatchObject({ days: 2, nonWorking: 2, weekdays: 0 });
  });
  it('counts 14 at 08:00 to 21 at 08:00 as seven days, including exactly two weekend days', () => {
    expect(newGuardWindow('2026-10-14')).toEqual({ startAt: '2026-10-14T08:00', endAt: '2026-10-21T08:00' });
    expect(guardDays('2026-10-14','2026-10-21')).toHaveLength(7);
    expect(guardSummary([{ technician: 'A', from:'2026-10-14',to:'2026-10-21' }],[],[],'2026-10')[0]).toMatchObject({days:7,weekdays:5,nonWorking:2});
  });
  it('switches current guard at exactly 08:00 Argentina, never host midnight or UTC 08:00', () => {
    const old = {technician:'A',from:'2026-10-14',to:'2026-10-21'}, next = {...old,from:'2026-10-21',to:'2026-10-28'};
    expect(guardIsCurrent(old,'2026-10-21T10:59:59Z')).toBe(true);
    expect(guardIsCurrent(old,'2026-10-21T11:00:00Z')).toBe(false);
    expect(guardIsCurrent(next,'2026-10-21T11:00:00Z')).toBe(true);
  });
  it('clips cross-year guards to the correct operational month without losing or duplicating days', () => {
    const rows = [{technician:'A',from:'2026-12-28',to:'2027-01-04'}];
    expect(guardSummary(rows,[],[],'2026-12')[0].days).toBe(4);
    expect(guardSummary(rows,[],[],'2027-01')[0].days).toBe(3);
  });
  it('unions duplicate coverage and gives each incoming member only their actual partial coverage', () => {
    const row = (technician:string,startAt:string,endAt:string) => ({technician,from:'2026-10-14',to:'2026-10-21',startAt,endAt,crewId:'one-crew'});
    const rows = [row('A','2026-10-14T08:00','2026-10-21T08:00'), row('A','2026-10-14T08:00','2026-10-21T08:00'), row('B','2026-10-14T08:00','2026-10-16T20:00'),row('C','2026-10-16T20:00','2026-10-21T08:00')];
    const summary = guardSummary(rows,[],[],'2026-10');
    expect(summary.find(r=>r.technician==='A')).toMatchObject({days:7,periods:1});
    expect(summary.find(r=>r.technician==='B')?.days).toBe(2.5);
    expect(summary.find(r=>r.technician==='C')?.days).toBe(4.5);
    expect(guardDailyCoverage(rows,'2026-10').filter(r=>r.day==='2026-10-16').map(r=>r.hours)).toEqual([24,12,12]);
  });
  it('does not create a payable day for a same-date historical record with no duration', () => {
    expect(guardSummary([{technician:'A',from:'2026-10-14',to:'2026-10-14'}],[],[],'2026-10')).toEqual([]);
  });
});
