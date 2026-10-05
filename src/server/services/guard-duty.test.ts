import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@/contracts';
import type { OperationsActor } from './operations';
const fake = vi.hoisted(() => ({ db: {} as Record<string, unknown>, weeks: [] as unknown[], off: [] as unknown[], visit: [] as unknown[] }));
vi.mock('@/server/prisma', () => ({ getPrismaClient: () => fake.db }));
vi.mock('./operational-data', () => ({ getPendingBySites: async () => ({}) }));
import { addGuardWeek, guardOverview, guardReport, removeGuardWeek, setVisitHours } from './guard-duty';
const user = { id: '00000000-0000-4000-8000-000000000001', name: 'Test', email: 'test@example.invalid', role: UserRole.COORDINATOR, active: true, technicianId: null, coordinatorId: null };
const non = 'NON - MPC Mantenimiento Preventivo', bam = 'BAM - MPC Mantenimiento Preventivo';
const actor: OperationsActor = { user, allowed: null };
const off = (id: string, project: string, hours: string | null) => ({ id, day: new Date('2026-10-03'), project, site_code: 'ST1', site_name: 'Sitio', task_code: 'FO-26-1', technicians: ['Chaves'], status: 'REALIZADO', outcome: '', hours: hours === null ? null : { toString: () => hours, valueOf: () => Number(hours) } });
let execute: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fake.weeks = [{ id: 'w1', technician: 'Chaves', week_start: new Date('2026-09-28') }]; fake.off = [off('v1', non, '2.5'), off('v2', bam, null)]; fake.visit = [{ project: non, shift: 'FUERA_DE_HORARIO' }];
  execute = vi.fn(async () => 1);
  const query = vi.fn(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('FROM ops_guard_weeks')) return fake.weeks;
    if (sql.includes('FROM ops_holidays')) return [{ day: new Date('2026-10-12'), name: 'Diversidad Cultural' }];
    if (sql.includes('FROM ops_visits v JOIN')) return fake.off;
    if (sql.includes('FROM ops_visits v LEFT JOIN')) return fake.visit;
    return [];
  });
  fake.db = { $queryRaw: query, $executeRaw: execute, $transaction: async (run: (tx: unknown) => unknown) => run(fake.db), preventivos: { findMany: async () => [] }, correctivos: { findMany: async () => [] }, cotizaciones: { findMany: async () => [] }, sytex_supply_form_contexts: { findMany: async () => [] }, sytex_form_states: { findMany: async () => [] } };
});
describe('guard duty service', () => {
  it('only accepts a guard week that starts on Monday and tells when it was already loaded', async () => {
    await expect(addGuardWeek(actor, { technician: 'Chaves', weekStart: '2026-10-06' })).rejects.toThrow('WEEK_MUST_START_MONDAY');
    expect(await addGuardWeek(actor, { technician: ' Chaves ', weekStart: '2026-10-05' })).toEqual({ saved: true, alreadyLoaded: false });
    execute.mockResolvedValue(0);
    expect(await addGuardWeek(actor, { technician: 'Chaves', weekStart: '2026-10-05' })).toEqual({ saved: true, alreadyLoaded: true });
  });
  it('removes a loaded week and refuses an unknown one', async () => {
    expect(await removeGuardWeek(actor, '00000000-0000-4000-8000-0000000000aa')).toEqual({ removed: true });
    execute.mockResolvedValue(0);
    await expect(removeGuardWeek(actor, '00000000-0000-4000-8000-0000000000aa')).rejects.toThrow('NOT_FOUND');
  });
  it('limits off-hours tasks to the zones of the account and gives CTIC no technician list', async () => {
    const limited = await guardOverview({ ...actor, allowed: [non] }, '2026-10-01', '2026-10-31');
    expect(limited.offHours.map((v) => v.id)).toEqual(['v1']);
    expect(limited.offHours[0].hours).toBe(2.5);
    const ctic = await guardOverview({ ...actor, ctic: true }, '2026-10-01', '2026-10-31');
    expect(ctic).toMatchObject({ ctic: true, technicians: [] });
    expect(ctic.weeks[0]).toMatchObject({ technician: 'Chaves', weekStart: '2026-09-28', weekEnd: '2026-10-04' });
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
    expect(report.summary[0]).toEqual(['Técnico', 'Semanas de guardia', 'Días de guardia pasiva', 'Lunes a viernes', 'Sábados', 'Domingos', 'Feriados', 'Tareas fuera de horario', 'Horas fuera de horario']);
    // Week of 28/09: 1-4 October (Thu, Fri, Sat, Sun) fall in October.
    expect(report.summary[1]).toEqual(['Chaves', 1, 4, 2, 1, 1, 0, 2, 2.5]);
    expect(report.days.slice(1).map((row) => row[3])).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(report.days[3][4]).toBe('Sábado');
    expect(report.holidays[1]).toEqual(['2026-10-12', 'Diversidad Cultural']);
  });
});
