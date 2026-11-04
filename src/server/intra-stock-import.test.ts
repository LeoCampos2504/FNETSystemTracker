import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { operationalWorkbook } from './operations-xlsx';
import { INTRA_FILE_LIMIT, inspectIntraXlsx, parseIntraRows, parseIntraXlsx, readIntraUpload } from './intra-stock-import';
const headers = ['Fecha','Factura','Proveedor','Reg-Zon-SZon','Producto','Disponible','Monto Neto','Liquidada','Acción'];
const line = ['03/11/2026','0001-000001','Proveedor de prueba','MED - NON - Salta','Gasoil Premium',187.33,100000,'NO',null];
const sheet = (...rows: unknown[][]) => [['Insumos'],headers,...rows];
describe('Intra source snapshot, bounded XLSX', () => {
  it('finds the actual second-row headers and keeps every invoice/product line', () => {
    const rows = parseIntraRows(sheet(line, [...line.slice(0,4),'Filtro Aceite',2,1000,'SI']));
    expect(rows).toHaveLength(2); expect(rows[0]).toMatchObject({operation:'NON',location:'Salta',quantity:187.33,fuel:true,date:'2026-11-03'});
    expect(rows[1]).toMatchObject({fuel:false,liquidated:'SI'}); expect(rows[0].id).not.toBe(rows[1].id);
  });
  it('keeps distinct repeated invoice lines and flags truly identical duplicates without dropping them', () => {
    const rows = parseIntraRows(sheet(line,line,[...line.slice(0,5),20,9000,'NO']));
    expect(rows).toHaveLength(3); expect(rows.map(r=>r.duplicate)).toEqual([true,true,false]); expect(new Set(rows.map(r=>r.id)).size).toBe(3);
  });
  it('keeps identity when the financial Liquidada flag changes, but not when the quantity changes', () => {
    const [first] = parseIntraRows(sheet(line));
    const paid = [...line]; paid[7]='SI';
    const changed = [...line]; changed[5]=190;
    expect(parseIntraRows(sheet(paid))[0].id).toBe(first.id); expect(parseIntraRows(sheet(changed))[0].id).not.toBe(first.id);
  });
  it('preserves decimal dots and accepts explicit Spanish decimals without treating 31.515 as thousands', () => {
    const source = [...line]; source[5]='31.515'; source[6]='1.709,40';
    expect(parseIntraRows(sheet(source))[0]).toMatchObject({quantity:31.515,net:1709.4});
  });
  it.each(['31/02/2026','2026-13-01','not a date'])('rejects invalid civil date %s', value => {
    const source = [...line]; source[0]=value; expect(()=>parseIntraRows(sheet(source))).toThrow();
  });
  it.each([-1,'12 litros','1.2345',null])('rejects ambiguous or unsupported quantity %s', value => {
    const source: unknown[] = [...line]; source[5]=value; expect(()=>parseIntraRows(sheet(source))).toThrow();
  });
  it('rejects missing/repeated headers and malformed scopes rather than partially importing', () => {
    expect(()=>parseIntraRows([['Fecha','Factura'],line])).toThrow();
    expect(()=>parseIntraRows([headers.concat('Disponible'),line])).toThrow();
    const source=[...line]; source[3]='NON'; expect(()=>parseIntraRows(sheet(source))).toThrow();
  });
  it('supports a complete empty snapshot and native civil dates without the host timezone', () => {
    expect(parseIntraRows(sheet())).toEqual([]);
    const source: unknown[]=[...line]; source[0]=new Date('2026-11-03T00:00:00Z');
    expect(parseIntraRows(sheet(source))[0].date).toBe('2026-11-03');
  });
  it('reads a real XLSX structure using the production parser', async () => {
    const bytes=operationalWorkbook([{name:'Sheet1',rows:sheet(line) as (string|number|null)[][]}]);
    expect(await parseIntraXlsx(bytes)).toHaveLength(1);
  });
  it('rejects macros, external links, cached formulas and archives above expanded limits', () => {
    const files=unzipSync(operationalWorkbook([{name:'Sheet1',rows:[headers,line]}]));
    for(const [name,content] of [['xl/vbaProject.bin','x'],['xl/externalLinks/link.xml','x'],['xl/worksheets/sheet1.xml',strFromU8(files['xl/worksheets/sheet1.xml']).replace('</sheetData>','<row r="5"><c r="A5"><f>1+1</f><v>2</v></c></row></sheetData>')]]) {
      expect(()=>inspectIntraXlsx(zipSync({...files,[name]:strToU8(content)}))).toThrow();
    }
    expect(()=>inspectIntraXlsx(zipSync({...files,'large.xml':new Uint8Array(17*1024*1024)}))).toThrow();
    expect(()=>inspectIntraXlsx(new Uint8Array(INTRA_FILE_LIMIT+1))).toThrow();
  });
  it('bounds streamed uploads even if content-length is missing', async () => {
    const request=new Request('http://localhost/upload',{method:'POST',body:new Uint8Array(INTRA_FILE_LIMIT+1)});
    await expect(readIntraUpload(request)).rejects.toMatchObject({code:'INTRA_FILE_TOO_LARGE'});
  });
  it('rejects extra worksheets instead of silently losing operations on another sheet', () => {
    const bytes=operationalWorkbook([{name:'NON',rows:[headers,line]},{name:'BAS',rows:[headers,line]}]);
    expect(()=>inspectIntraXlsx(bytes)).toThrow();
  });
});
