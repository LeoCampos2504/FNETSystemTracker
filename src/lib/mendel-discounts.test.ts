import { describe, expect, it } from 'vitest';
import { EMPTY_TRAY_FILTERS, filterTray, hasTrayDiscount, parseTrayCsv, traySourcePeriod } from './mendel-bandeja';
const original = () => parseTrayCsv('Fecha;Usuario;Comercio;Total;Notas;Nota de aprobacion\n28/10/2026;Persona sintética;Comercio sintético;100;ok - Eugenia Salto / descuento en su totalidad;\n27/10/2026;Persona sintética;Comercio sintético;50;Sin novedades;DESCUENTOS a revisar\n26/10/2026;Persona sintética;Comercio sintético;20;Compra normal;').rows;
describe('discount mentions and source freshness', () => {
  it('finds singular/plural in both comments and keeps signed rows in discount mode', () => {
    const rows = original();
    expect(rows.map(hasTrayDiscount)).toEqual([true, true, false]);
    expect(filterTray(rows, { ...EMPTY_TRAY_FILTERS, discountsOnly: true })).toHaveLength(2);
    expect(filterTray(rows, EMPTY_TRAY_FILTERS)).toHaveLength(2);
    expect(rows[0].officialApproval).toBe('');
  });
  it('reads audit comments as a separate field, not approval, and searches discounts in them', () => {
    const parsed = parseTrayCsv('Fecha;Usuario;Comercio;Total;Notas;Notas de auditoria\n28/10/2026;Prueba;Prueba;1;Compra;OK Eugenia Salto / descuento en su totalidad');
    expect(parsed.sourceFields).toContain('auditNotes');
    expect(parsed.rows[0].approvalNotes).toBe('');
    expect(parsed.rows[0].auditNotes).toContain('descuento');
    expect(filterTray(parsed.rows, { ...EMPTY_TRAY_FILTERS, discountsOnly: true })).toHaveLength(1);
    expect(filterTray(parsed.rows, EMPTY_TRAY_FILTERS)).toHaveLength(0);
  });
  it('keeps zone/date/query filters active and never changes amounts or notes', () => {
    const rows = original().map(r => ({ ...r, zone: 'TEST' })), before = JSON.stringify(rows);
    expect(filterTray(rows, { ...EMPTY_TRAY_FILTERS, discountsOnly: true, zone: 'TEST', from: '2026-10-28', query: 'totalidad' })).toEqual([rows[0]]);
    expect(JSON.stringify(rows)).toBe(before);
  });
  it('does not infer deductions from OK, names, amounts, merchant or longer words', () => {
    const row = original()[0];
    expect(hasTrayDiscount({ ...row, notes: 'OK Eugenia Salto', approvalNotes: '' })).toBe(false);
    expect(hasTrayDiscount({ ...row, notes: 'descuentoso', approvalNotes: '' })).toBe(false);
    expect(hasTrayDiscount({ ...row, notes: null, approvalNotes: '' })).toBe(false);
  });
  it('reports file coverage before hiding signatures and without mistaking an invalid date for newest', () => {
    const rows = original();
    expect(traySourcePeriod([...rows, { date: '31/02/2026' }])).toEqual({ first: '2026-10-26', last: '2026-10-28', invalidDates: 1 });
    expect(traySourcePeriod([])).toEqual({ first: '', last: '', invalidDates: 0 });
    expect(traySourcePeriod([{ date: '2026-10-28T01:30:00Z' }]).last).toBe('2026-10-27');
  });
});
