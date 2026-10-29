import { expect, it, vi } from 'vitest';
import { parseTrayCsv } from './mendel-bandeja';
import { planMendelImport, saveMendelImport } from './mendel-csv-import';

const parsed = parseTrayCsv('ID transaccion;Fecha;Usuario;Comercio;Total;Moneda;Presupuesto;Notas\nOLD;28/10/2026;Persona ficticia;Tienda;10;ARS;CIVIL;ok - Eugenia Salto\nNEW;29/10/2026;Persona nueva;Tienda;20;ARS;CIVIL;ok - Eugenia Salto\nNOZONE;29/10/2026;Sin asignar;Tienda;30;ARS;CIVIL;');
const rows = parsed.rows.map((r, i) => ({ ...r, zone: i < 2 ? 'PCS' : '' }));
const old = { ...rows[0], snapshotHash: 'a'.repeat(64) };
const refreshed = { updated: 1, unchanged: 0, issues: [] };

it('plans the entire CSV including signed new rows of the 29th, separately from missing zones', () => {
  const plan = planMendelImport(rows, [old], parsed.sourceFields);
  expect(plan.ready.map(r => r.transactionId)).toEqual(['NEW']);
  expect(plan.pending.map(r => r.transactionId)).toEqual(['NOZONE']);
  expect(plan.updates.map(r => r.transactionId)).toEqual(['OLD']);
});
it('refreshes existing AND saves new rows, then verifies their persistence', async () => {
  const read = vi.fn().mockResolvedValueOnce([old]).mockResolvedValueOnce([old, rows[1]]);
  const refresh = vi.fn().mockResolvedValue(refreshed), insert = vi.fn().mockResolvedValue(1);
  expect(await saveMendelImport(rows, parsed.sourceFields, { read, refresh, insert })).toMatchObject({ inserted: 1, updated: 1, pending: [rows[2]] });
  expect(read).toHaveBeenCalledTimes(2); expect(insert).toHaveBeenCalledWith([rows[1]]);
});
it('still imports unrelated new expenses when an old expense has a protected conflict', async () => {
  const conflict = { ...refreshed, updated: 0, issues: [{ transactionId: 'OLD', reason: 'SOURCE_FACTS_CHANGED' }] };
  const result = await saveMendelImport(rows, parsed.sourceFields, {
    read: vi.fn().mockResolvedValueOnce([old]).mockResolvedValueOnce([old, rows[1]]),
    refresh: vi.fn().mockResolvedValue(conflict), insert: vi.fn().mockResolvedValue(1),
  });
  expect(result).toMatchObject({ inserted: 1, issues: conflict.issues });
});
it('fails closed on catalog errors, without treating all IDs as new', async () => {
  const insert = vi.fn(), refresh = vi.fn();
  await expect(saveMendelImport(rows, parsed.sourceFields, { read: vi.fn().mockRejectedValue(Error('offline')), refresh, insert })).rejects.toThrow('offline');
  expect(insert).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
});
it('does not report success if new IDs cannot be verified after saving', async () => {
  await expect(saveMendelImport(rows, parsed.sourceFields, { read: vi.fn().mockResolvedValue([old]), refresh: vi.fn().mockResolvedValue(refreshed), insert: vi.fn().mockResolvedValue(1) })).rejects.toThrow('no aparecen');
});
it('retries without inserting duplicate IDs and rejects duplicate CSV IDs', async () => {
  const plan = planMendelImport(rows, [old, { ...rows[1], snapshotHash: 'b'.repeat(64) }], parsed.sourceFields);
  expect(plan.ready).toEqual([]); expect(plan.updates).toHaveLength(2);
  expect(() => planMendelImport([rows[1], rows[1]], [], [])).toThrow('repite');
});
