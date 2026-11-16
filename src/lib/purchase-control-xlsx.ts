import { strToU8, zipSync } from 'fflate';

const xml = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** All cells are literal strings: imported data can never become spreadsheet formulas. */
export function purchaseControlWorkbook(rows: string[][]): Uint8Array {
  if (rows.some(row => row.some(cell => cell.length > 32767))) throw new Error('XLSX_CELL_TOO_LONG');
  const files: Record<string, Uint8Array> = {};
  const add = (name: string, value: string) => { files[name] = strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + value); };
  add('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  add('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  add('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Compras" sheetId="1" r:id="rId1"/></sheets></workbook>');
  add('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  const letters = (col: number) => { let s = ''; for (let n = col + 1; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s; };
  add('xl/worksheets/sheet1.xml', `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols>${rows[0].map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="24" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((row, i) => `<row r="${i + 1}">${row.map((cell, j) => `<c r="${letters(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`).join('')}</row>`).join('')}</sheetData><autoFilter ref="A1:${letters(rows[0].length - 1)}${rows.length}"/></worksheet>`);
  return zipSync(files, { level: 6 });
}
