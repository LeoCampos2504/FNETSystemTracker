import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@/contracts';
import type { OperationsActor } from './operations';
const fake = vi.hoisted(() => ({ db: {} as Record<string, unknown>, periods: [] as unknown[], legacy: [] as unknown[], same: [] as unknown[], off: [] as unknown[], visit: [] as unknown[] }));
vi.mock('@/server/prisma', () => ({ getPrismaClient: () => fake.db }));
vi.mock('./operational-data', () => ({ getPendingBySites: async () => ({}) }));
import { addGuardPeriod, addHoliday, guardOverview, guardReport, removeGuardPeriod, setVisitHours, updateGuardPeriod } from './guard-duty';
const user = { id: '00000000-0000-4000-8000-000000000001', name: 'Test', email: 'test@example.invalid', role: UserRole.COORDINATOR, active: true, technicianId: null, coordinatorId: null };
const non = 'NON - MPC Mantenimiento Preventivo', bam = 'BAM - MPC Mantenimiento Preventivo';
const actor: OperationsActor = { user, allowed: null };
const off = (id: string, project: string, hours: string | null) => ({ id, day: new Date('2026-10-03'), project, site_code: 'ST1', site_name: 'Sitio', task_code: 'FO-26-1', technicians: ['Chaves'], status: 'REALIZADO', outcome: '', hours: hours === null ? null : { toString: () => hours, valueOf: () => Number(hours) } });
let execute: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fake.periods = [{ id: 'p1', technician: 'Chaves', date_from: new Date('2026-09-30'), date_to: new Date('2026-10-07') }]; fake.legacy = []; fake.same = []; fake.off = [off('v1', non, '2.5'), off('v2', bam, null)]; fake.visit = [{ project: non, shift: 'FUERA_DE_HORARIO' }];
  execute = vi.fn(async () => 1);
  const query = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('FROM ops_guard_periods WHERE date_from')) return fake.periods;
    if (sql.includes('FROM ops_guard_periods WHERE lower')) return fake.same;
    if (sql.includes('FROM ops_guard_weeks')) return fake.legacy;
    if (sql.includes('FROM ops_holidays')) return [{ day: new Date('2026-10-12'), name: 'Diversidad Cultural' }];
    if (sql.includes('FROM ops_visits v JOIN')) return fake.off;
    if (sql.includes('FROM ops_visits v LEFT JOIN')) return fake.visit;
    return [];
  });
  fake.db = { $queryRaw: query, $executeRaw: execute, $transaction: async (run: (tx: unknown) => unknown) => run(fake.db), preventivos: { findMany: async () => [] }, correctivos: { findMany: async () => [] }, cotizaciones: { findMany: async () => [] }, sytex_supply_form_contexts: { findMany: async () => [] }, sytex_form_states: { findMany: async () => [] } };
});
describe('guard duty service', () => {
  it('accepts a guard that starts on any day, refuses reversed or overlong ones and tells when it was already loaded', async () => {
    await expect(addGuardPeriod(actor, { technician: 'Chaves', from: '2026-10-08', to: '2026-10-07' })).rejects.toThrow('GUARD_PERIOD_INVALID');
    await expect(addGuardPeriod(actor, { technician: 'Chaves', from: '2026-01-01', to: '2026-06-30' })).rejects.toThrow('GUARD_PERIOD_INVALID');
    expect(await addGuardPeriod(actor, { technician: ' Chaves ', from: '2026-10-07', to: '2026-10-14' })).toEqual({ saved: true, alreadyLoaded: false });
    fake.same = [{ id: 'p1' }];
    expect(await addGuardPeriod(actor, { technician: 'chaves', from: '2026-10-07', to: '2026-10-14' })).toEqual({ saved: true, alreadyLoaded: true });
  });
  it('modifies a guard, moving an old Monday-to-Sunday week to the new table, and refuses an unknown one', async () => {
    const id = '00000000-0000-4000-8000-0000000000aa', input = { id, technician: 'Chaves', from: '2026-10-07', to: '2026-10-15' };
    expect(await updateGuardPeriod(actor, input)).toEqual({ saved: true });
    execute.mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValue(1);
    expect(await updateGuardPeriod(actor, input)).toEqual({ saved: true });
    execute.mockResolvedValue(0);
    await expect(updateGuardPeriod(actor, input)).rejects.toThrow('NOT_FOUND');
    await expect(updateGuardPeriod(actor, { ...input, to: '2026-10-01' })).rejects.toThrow('GUARD_PERIOD_INVALID');
  });
  it('removes a loaded guard from either table and refuses an unknown one', async () => {
    expect(await removeGuardPeriod(actor, '00000000-0000-4000-8000-0000000000aa')).toEqual({ removed: true });
    execute.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    expect(await removeGuardPeriod(actor, '00000000-0000-4000-8000-0000000000aa')).toEqual({ removed: true });
    execute.mockResolvedValue(0);
    await expect(removeGuardPeriod(actor, '00000000-0000-4000-8000-0000000000aa')).rejects.toThrow('NOT_FOUND');
  });
  it('loads one holiday or a run of days, with an optional name', async () => {
    expect(await addHoliday(actor, { day: '2026-10-10', name: 'Feriado puente' })).toEqual({ saved: true, days: 1 });
    execute.mockClear();
    expect(await addHoliday(actor, { day: '2026-10-10', to: '2026-10-12' })).toEqual({ saved: true, days: 3 });
    expect(execute.mock.calls.filter(([strings]) => String(strings.join('?')).includes('INTO ops_holidays'))).toHaveLength(3);
    await expect(addHoliday(actor, { day: '2026-10-12', to: '2026-10-10' })).rejects.toThrow('HOLIDAY_RANGE_INVALID');
    await expect(addHoliday(actor, { day: '2026-01-01', to: '2026-03-01' })).rejects.toThrow('HOLIDAY_RANGE_INVALID');
  });
  it('limits off-hours tasks to the zones of the account and gives CTIC no technician list', async () => {
    const limited = await guardOverview({ ...actor, allowed: [non] }, '2026-10-01', '2026-10-31');
    expect(limited.offHours.map((v) => v.id)).toEqual(['v1']);
    expect(limited.offHours[0].hours).toBe(2.5);
    const ctic = await guardOverview({ ...actor, ctic: true }, '2026-10-01', '2026-10-31');
    expect(ctic).toMatchObject({ ctic: true, technicians: [] });
    expect(ctic.periods[0]).toMatchObject({ technician: 'Chaves', from: '2026-09-30', to: '2026-10-07' });
    fake.legacy = [{ id: 'old', technician: 'Yareco M', date_from: new Date('2026-10-05'), date_to: new Date('2026-10-11') }];
    expect((await guardOverview(actor, '2026-10-01', '2026-10-31')).periods.map((p) => p.id)).toEqual(['p1', 'old']);
    expect(ctic.offHours.map((v) => v.id)).toEqual(['v1', 'v2']);
  });
  it('keeps hours for off-hours visits of allowed zones only', async () => {
    const id = '00000000-0000-4000-8000-0000000000bb';
    expect(await setVisitHours(actor, { visitId: id, hours: 1.5 })).toEqual({ saved: true });
    await expect(setVisitHours({ ...actor, allowed: [bam] }, { visitId: id, hours: 1 })).rejects.toThrow('FORBIDDEN_PROJECT');
    fake.visit = [{ project: non, shift: 'LABORAL' }];
    await expect(setVisitHours(actor, { visitId: id, hours: 1 })).rejects.toThrow('VISIT_NOT_OUT_OF_HOURS');
    fake.visit = [];
    await expect(setVisitHours(actor, { visitId: id, hours: null })).rejects.toThrow('NOT_FOUND');
  });
  it('builds the month-end sheets', async () => {
    const report = await guardReport(actor, '2026-10');
    expect(report.summary[0]).toEqual(['Técnico', 'Períodos de guardia', 'Días de guardia pasiva', 'Días hábiles (lunes a viernes)', 'Días no laborales (sábados, domingos y feriados)', 'Tareas fuera de horario', 'Horas fuera de horario']);
    // Guard 30/09 to 07/10: only 1-7 October fall in the month (Thu to Wed), with Saturday 3 and Sunday 4 as non-working days.
    expect(report.summary[1]).toEqual(['Chaves', 1, 7, 5, 2, 2, 2.5]);
    expect(report.days.slice(1).map((row) => row[3])).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
    expect(report.days[3]).toEqual(['Chaves', '2026-09-30', '2026-10-07', '2026-10-03', 'sábado', 'Sábado']);
    expect(report.holidays[1]).toEqual(['2026-10-12', 'Diversidad Cultural']);
  });
});
