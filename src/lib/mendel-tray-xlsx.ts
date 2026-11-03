import { strToU8, zipSync } from 'fflate';
import { trayDate, trayMoney, type TrayRow } from './mendel-bandeja';

const HEADERS = ['Fecha', 'Zona', 'Usuario', 'Comercio', 'Total', 'Presupuesto', 'Notas'];
const WIDTHS = [15, 12, 33, 32, 21, 25, 85];
const xml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Receives the complete filtered list, never just the current screen page. */
export function mendelTrayWorkbook(rows: readonly TrayRow[]) {
  const table = [HEADERS, ...rows.map(r => [trayDate(r.date), r.zone || 'Sin zona', r.person || 'Sin persona', r.merchant, trayMoney(r.amount, r.currency), r.budget,
    (r.notes ?? 'No disponible') + (r.auditNotes ? `\nAuditoría: ${r.auditNotes}` : '')])];
  if (table.some(row => row.some(value => value.length > 32767))) throw Error('Una celda supera el límite de Excel (32.767 caracteres). No se recortó ninguna nota.');
  const files: Record<string, Uint8Array> = {};
  const add = (name: string, data: string) => { files[name] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + data); };
  add('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  add('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  add('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rendiciones" sheetId="1" r:id="rId1"/></sheets></workbook>');
  add('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  const styles = [
    '<xf fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
    '<xf fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
    '<xf fontId="0" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
    '<xf fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="top" wrapText="1"/></xf>',
    '<xf fontId="0" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="top" wrapText="1"/></xf>',
  ];
  add('xl/styles.xml', `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><color rgb="FF17324D"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF078EAD"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F7FB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><right style="thin"><color rgb="FFFFFFFF"/></right></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5">${styles.join('')}</cellXfs></styleSheet>`);
  const end = `G${table.length}`;
  add('xl/worksheets/sheet1.xml', `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${WIDTHS.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${table.map((row, i) => {
    const lines = Math.max(...row.map((value, col) => value.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (WIDTHS[col] - 3))), 0)));
    const height = i === 0 ? 30 : Math.min(409, Math.max(34, lines * 16 + 12));
    return `<row r="${i + 1}" ht="${height}" customHeight="1">${row.map((value, col) => `<c r="${String.fromCharCode(65 + col)}${i + 1}" s="${i === 0 ? 1 : col === 4 ? i % 2 ? 3 : 4 : i % 2 ? 0 : 2}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`;
  }).join('')}</sheetData><autoFilter ref="A1:${end}"/></worksheet>`);
  return zipSync(files, { level: 6 });
}
