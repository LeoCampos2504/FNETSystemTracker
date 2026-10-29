import { expect, it } from 'vitest';
import { readSheet } from 'read-excel-file/node';
import { strFromU8, unzipSync } from 'fflate';
import { physicalAuditWorkbook } from './physical-audit-export';
import { parseAuditSheet, type AuditPerson } from '@/lib/physical-audits';
const row = { id: 'fake', cuil: '20000000001', version: 1, name: 'Persona sintética', role: 'Líder', sector: 'PCS', location: 'Localidad', status: 'Realizada', lastDate: '2026-10-29', nextDate: '2026-11-29', exception: 'Control anticipado', notes: '=HYPERLINK("bad")' } as AuditPerson;
const filters = { query: '', sector: '', status: '', due: '', warningDays: 15 };
it('exports an actual XLSX with typed dates and text identifiers, without executing notes as formulas', async () => {
  const bytes = physicalAuditWorkbook([row], filters, '2026-10-29', true), files = unzipSync(bytes);
  const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
  expect(sheet).toContain('r="G2" s="3" t="n"'); expect(sheet).toContain('r="A2" s="0" t="inlineStr"');
  expect(sheet).not.toContain('<f>');
  const cells = await readSheet(Buffer.from(bytes), 'Control_Auditorias');
  expect(cells).toHaveLength(2);
  expect(parseAuditSheet(cells).rows[0]).toMatchObject({ cuil: row.cuil, data: { lastDate: row.lastDate, nextDate: row.nextDate, exception: row.exception, notes: row.notes } });
});
it('supports empty filtered reports without fabricated people or dates', async () => {
  const cells = await readSheet(Buffer.from(physicalAuditWorkbook([], filters, '2026-10-29', false)), 'Control_Auditorias');
  expect(cells).toHaveLength(1);
});
