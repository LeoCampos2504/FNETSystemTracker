import { describe, expect, it, vi } from 'vitest';
vi.mock('@/server/prisma', () => ({ getPrismaClient: () => ({}) }));
import { isFormStartQuestion } from '@/lib/form-execution-date';
import { fuelLoadsFromAnswers, formExecutionDates, type StoredAnswer } from './site-control';
import { siteTopic, parseSytexSiteAnswers } from '@/server/sytex-supply-export';
const answer = (question: string, value: string, extra: Partial<StoredAnswer> = {}): StoredAnswer => ({ formCode: 'FO-26-000001', siteCode: 'JU00001', siteName: 'Sitio de prueba', topic: siteTopic('General', question) ?? '', groupName: 'General', position: question, question, answer: value, reportedAt: '2026-10-13T17:25:45.217', ...extra });
const amount = () => answer('CANTIDAD DE LITROS DE COMBUSTIBLE CARGADOS', '40');
describe('fuel realization date, never approval or last edit', () => {
  it('reads the verified corrective start answer: work on 02/10 remains 02/10 despite editing on 13/10', () => {
    const [load] = fuelLoadsFromAnswers([amount(), answer('El Mantenimiento Correctivo Inicia el:', '2026-10-02 10:15:00')]);
    expect(load).toMatchObject({ date: '2026-10-02T13:15:00.000Z', dateBasis: 'FORM_START', reportedAt: '2026-10-13T20:25:45.217Z' });
  });
  it('reads the verified preventive start independently of submission and approval', () => {
    const [load] = fuelLoadsFromAnswers([amount(), answer('Fecha y Hora de Inicio de tareas', '26/10/2026 14:19')]);
    expect(load.date).toBe('2026-10-26T17:19:00.000Z');
    expect(load.dateBasis).toBe('FORM_START');
  });
  it('prefers the explicit load date to the general work start and preserves Argentina midnight', () => {
    const [load] = fuelLoadsFromAnswers([amount(), answer('Fecha de carga de combustible', '2026-10-03T01:30:00Z'), answer('Fecha de realización', '2026-10-02')]);
    expect(load).toMatchObject({ date: '2026-10-03T01:30:00.000Z', dateBasis: 'LOAD' });
  });
  it('never turns missing, invalid or conflicting starts into an approval date', () => {
    for (const rows of [[], [answer('Fecha y Hora de Inicio de tareas', '31/02/2026')], [answer('Fecha de realización', '2026-10-02'), answer('Fecha y Hora de Inicio de tareas', '2026-10-03')]]) {
      const [load] = fuelLoadsFromAnswers([amount(), ...rows]);
      expect(load.date).toBeNull(); expect(load.dateBasis).toBe('UNVERIFIED');
    }
  });
  it('does not borrow a start from another form or site, nor an end, plan or approval', () => {
    expect(formExecutionDates([answer('Fecha de realización', '2026-10-02', { siteCode: 'ST00001' })]).size).toBe(1);
    const [load] = fuelLoadsFromAnswers([amount(), answer('Fecha de realización', '2026-10-02', { siteCode: 'ST00001' })]);
    expect(load.date).toBeNull();
    for (const q of ['El Mantenimiento Correctivo Finaliza el:', 'Fecha y Hora Final de las tareas', 'Última edición el', 'Fecha de aprobación', 'Fecha de inicio plan']) expect(isFormStartQuestion(q)).toBe(false);
  });
  it('keeps execution answers in the actual Sytex export parser, including fuel-only forms', () => {
    const rows = parseSytexSiteAnswers([
      ['Formulario','Grupo','Índice','Pregunta','Respuesta','Códigos de sitios afectados','Nombres de sitios afectados','Estado','Última edición el'],
      ['FO-26-000001','General','1.1','Fecha y Hora de Inicio de tareas','2026-10-02 10:15:00','JU00001','Prueba','Approved','2026-10-13 14:25'],
    ]);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ topic: 'EJECUCION', answer: '2026-10-02 10:15:00' });
  });
});
