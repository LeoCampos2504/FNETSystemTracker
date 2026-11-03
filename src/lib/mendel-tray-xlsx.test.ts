import { expect, it } from 'vitest';
import { readSheet } from 'read-excel-file/node';
import { strFromU8, unzipSync } from 'fflate';
import type { TrayRow } from './mendel-bandeja';
import { mendelTrayWorkbook } from './mendel-tray-xlsx';
const row = { key: 'synthetic', date: '2026-11-03', zone: 'PCS', person: 'Persona sintética', merchant: 'Tienda', amount: '29040', currency: 'ARS', budget: 'CIVIL - PCS', notes: 'Nota completa\n' + 'detalle '.repeat(150), auditNotes: 'descuento íntegro', approvalNotes: 'NO EXPORTAR APROBACIÓN', internalDecision: 'AUTORIZADO', transactionId: 'NO EXPORTAR ID' } as TrayRow;
it('exports only the seven requested panel columns, preserving the complete note', async () => {
  const bytes = mendelTrayWorkbook([row]);
  const cells = await readSheet(Buffer.from(bytes), 'Rendiciones');
  expect(cells[0]).toEqual(['Fecha', 'Zona', 'Usuario', 'Comercio', 'Total', 'Presupuesto', 'Notas']);
  expect(cells[1][0]).toBe('03/11/2026');
  expect(cells[1][6]).toBe(row.notes + '\nAuditoría: ' + row.auditNotes);
  expect(JSON.stringify(cells)).not.toContain('NO EXPORTAR');
  expect(cells[1]).toHaveLength(7);
});
it('includes the entire filtered selection, not only a screen page', async () => {
  const cells = await readSheet(Buffer.from(mendelTrayWorkbook(Array.from({ length: 65 }, (_, i) => ({ ...row, person: `Persona ${i}` })))), 'Rendiciones');
  expect(cells).toHaveLength(66); expect(cells[65][2]).toBe('Persona 64');
});
it('uses wrapped notes and panel colours, and never turns text into an executable formula', () => {
  const files = unzipSync(mendelTrayWorkbook([{ ...row, notes: '=HYPERLINK("bad")' }]));
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  expect(sheet).not.toContain('<f>'); expect(sheet).toContain('=HYPERLINK(&quot;bad&quot;)');
  const styles = strFromU8(files['xl/styles.xml']);
  expect(styles).toContain('wrapText="1"'); expect(styles).toContain('FF078EAD');
});
it('fails explicitly instead of silently truncating a note beyond Excel limits', () => {
  expect(() => mendelTrayWorkbook([{ ...row, notes: 'x'.repeat(32768) }])).toThrow('No se recortó');
});
