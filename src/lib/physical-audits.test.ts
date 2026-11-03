import { describe, expect, it } from 'vitest';
import { auditDataSchema, auditDue, filterAudits, nextAuditDate, parseAuditSheet, type AuditPerson } from './physical-audits';
const headers = ['CUIL', 'Nombre Completo', 'Rol / Cuadrilla', 'Sector', 'Locación', 'Estado Auditoría', 'Fecha Última Aud.', 'Observaciones / Ref. Email', 'Próxima Auditoría'];
const cells = ['20000000001', 'Persona sintética', 'Líder', 'CIVIL - PCS', 'Localidad', 'Realizada', '2026-10-13', '', '2027-01-13'];
describe('physical audit civil dates and import', () => {
  it('adds three calendar months, clamps month ends and preserves leap years', () => {
    expect(nextAuditDate('2026-10-29')).toBe('2027-01-29');
    expect(nextAuditDate('2026-01-31')).toBe('2026-04-30');
    expect(nextAuditDate('2027-11-30')).toBe('2028-02-29');
    expect(nextAuditDate('2026-02-30')).toBe('');
  });
  it('keeps an imported exceptional date instead of replacing it with three months', () => {
    const parsed = parseAuditSheet([headers, [...cells.slice(0, 8), '2026-11-13']]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].data).toMatchObject({ nextDate: '2026-11-13', exception: 'Fecha excepcional de la planilla original' });
  });
  it('handles real Excel dates, missing dates and labels without inventing audit completion', () => {
    const parsed = parseAuditSheet([headers, [...cells.slice(0, 6), new Date('2026-08-05T00:00:00Z'), '', ''], ['20000000002', 'Otra persona', '', 'CA', '', 'Pendiente', 'Sin realizar', '', '']]);
    expect(parsed.rows[0].data).toMatchObject({ lastDate: '2026-08-05', nextDate: '2026-11-05' });
    expect(parsed.rows[1].data).toMatchObject({ status: 'Pendiente', lastDate: '', nextDate: '' });
  });
  it('reports duplicate identifiers, missing headers and bad dates without silently accepting them', () => {
    expect(parseAuditSheet([headers, cells, cells]).errors).toHaveLength(1);
    expect(() => parseAuditSheet([headers.slice(1), cells])).toThrow('cuil');
    expect(parseAuditSheet([headers, [...cells.slice(0, 6), '2026-02-30', '', '']]).errors).toHaveLength(1);
  });
  it('requires a reason for an exceptional date and rejects next before last', () => {
    const data = parseAuditSheet([headers, cells]).rows[0].data;
    expect(auditDataSchema.safeParse({ ...data, nextDate: '2026-11-13' }).success).toBe(false);
    expect(auditDataSchema.safeParse({ ...data, nextDate: '2026-11-13', exception: 'Control anticipado' }).success).toBe(true);
    expect(auditDataSchema.safeParse({ ...data, nextDate: '2026-01-01', exception: 'No válida' }).success).toBe(false);
  });
  it('distinguishes overdue, today, upcoming, current and no date using date-only boundaries', () => {
    const base = { status: 'Realizada' as const, nextDate: '2026-10-29' };
    expect(auditDue(base, '2026-10-29')).toBe('Vence hoy');
    expect(auditDue(base, '2026-10-30')).toBe('Vencida');
    expect(auditDue(base, '2026-10-14', 15)).toBe('Próxima');
    expect(auditDue(base, '2026-10-13', 15)).toBe('Vigente');
    expect(auditDue({ ...base, nextDate: '' }, '2026-10-29')).toBe('Sin fecha');
    expect(auditDue({ ...base, status: 'Eximida' }, '2026-10-30')).toBe('Exenta');
  });
  it('uses the same query/sector/state/due rules for list and Excel export', () => {
    const data = parseAuditSheet([headers, cells]).rows[0].data;
    const rows = [{ ...data, id: 'synthetic', cuil: '20000000001', version: 1 }] as AuditPerson[];
    expect(filterAudits(rows, { query: 'sintetica', sector: 'CIVIL - PCS', status: 'Realizada', due: 'Vigente', warningDays: 15 }, '2026-10-29')).toHaveLength(1);
    expect(filterAudits(rows, { query: '', sector: 'OTHER', status: '', due: '', warningDays: 15 }, '2026-10-29')).toEqual([]);
  });
});
