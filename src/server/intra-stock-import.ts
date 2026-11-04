import { createHash } from 'node:crypto';
import { Unzip, UnzipInflate, strFromU8 } from 'fflate';
import { readSheet } from 'read-excel-file/node';
import type { IntraLine } from '@/contracts/intra-stock';
import { fold } from '@/lib/filters';
import { intraFuel, intraScopeParts } from '@/lib/intra-stock';
import { SupplyError } from './services/supply-control';

export const INTRA_FILE_LIMIT = 2 * 1024 * 1024;
const invalid = (code = 'INTRA_FILE_INVALID'): never => { throw new SupplyError(code, 422); };
export const intraHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (v: unknown, max = 300) => {
  const s = typeof v === 'string' || typeof v === 'number' ? String(v).trim().replace(/\s+/g, ' ') : '';
  if (s.length > max) invalid();
  return s;
};
function number(v: unknown) {
  const s = typeof v === 'string' ? v.trim().replace(/\s/g, '') : '';
  const n = typeof v === 'number' ? v : s && /^\d+(?:[.,]\d+)*$/.test(s) ? Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1e9 || Math.abs(n * 1000 - Math.round(n * 1000)) > 0.00001) invalid('INTRA_NUMBER_INVALID');
  return Math.round(n * 1000) / 1000;
}
function civilDate(value: unknown) {
  let result: string;
  if (value instanceof Date && !Number.isNaN(value.getTime())) result = value.toISOString().slice(0, 10);
  else if (typeof value === 'number' && Number.isInteger(value) && value > 30000 && value < 80000) result = new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  else {
    const s = text(value), match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    result = match ? `${match[3]}-${match[2]}-${match[1]}` : s;
  }
  const parsed = new Date(result + 'T12:00:00Z');
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(result) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) invalid('INTRA_DATE_INVALID');
  return result;
}
const headers = ['fecha', 'factura', 'proveedor', 'reg-zon-szon', 'producto', 'disponible', 'monto neto', 'liquidada'];
export function parseIntraRows(sheet: unknown[][]): IntraLine[] {
  if (sheet.length > 2020 || sheet.some(r => r.length > 30)) invalid('INTRA_ROW_LIMIT');
  const header = sheet.findIndex((row, index) => index < 10 && headers.every(h => row.map(v => fold(text(v))).includes(h)));
  if (header < 0) invalid('INTRA_HEADERS_INVALID');
  const labels = sheet[header].map(v => fold(text(v)));
  if (headers.some(h => labels.filter(v => v === h).length !== 1)) invalid('INTRA_HEADERS_INVALID');
  const seen = new Map<string, number>();
  const rows: IntraLine[] = [];
  for (const cells of sheet.slice(header + 1)) {
    if (!cells.some(v => v !== null && v !== undefined && v !== '')) continue;
    const get = (h: string) => cells[labels.indexOf(h)];
    const scope = text(get('reg-zon-szon')), { operation, location } = intraScopeParts(scope);
    const base = {
      date: civilDate(get('fecha')), invoice: text(get('factura')), supplier: text(get('proveedor')),
      scope, operation, location, product: text(get('producto')), quantity: number(get('disponible')), net: number(get('monto neto')),
    };
    if (!base.invoice || !base.supplier || !base.product) invalid();
    // A changed quantity/product/invoice is a new source line: never move old usage onto it silently.
    const identity = intraHash(base), occurrence = (seen.get(identity) ?? 0) + 1;
    seen.set(identity, occurrence);
    rows.push({ ...base, id: identity + ':' + occurrence, liquidated: text(get('liquidada'), 30), fuel: intraFuel(base.product), duplicate: false });
  }
  return rows.map(r => ({ ...r, duplicate: (seen.get(r.id.split(':')[0]) ?? 0) > 1 }));
}

export function inspectIntraXlsx(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > INTRA_FILE_LIMIT) throw new SupplyError('INTRA_FILE_TOO_LARGE', 413);
  let expanded = 0, count = 0;
  const names = new Set<string>();
  try {
    const zip = new Unzip(file => {
      if (++count > 500 || names.has(file.name) || /(?:^|\/)\.\.(?:\/|$)|\\|vbaProject|externalLinks|\.bin$/i.test(file.name) || file.name.startsWith('/') || (file.originalSize ?? 0) > 16 * 1024 * 1024) throw Error();
      names.add(file.name);
      const xml: Uint8Array[] = [];
      file.ondata = (error, data, final) => {
        if (error) throw error;
        expanded += data.length;
        if (expanded > 16 * 1024 * 1024) throw Error();
        if (/^xl\/worksheets\/.*\.xml$/.test(file.name)) {
          xml.push(data);
          if (final) {
            const content = strFromU8(Buffer.concat(xml));
            if (/<(?:\w+:)?f(?:\s|\/|>)/.test(content) || /<!DOCTYPE|<!ENTITY/i.test(content) || (content.match(/<(?:\w+:)?row(?:\s|>)/g)?.length ?? 0) > 2020) throw Error();
          }
        }
      };
      file.start();
    });
    zip.register(UnzipInflate);
    // Small compressed chunks also bound inflater output before the expanded-byte check;
    // do not inflate an entire untrusted archive into one allocation.
    for (let offset = 0; offset < bytes.length; offset += 4096) zip.push(bytes.subarray(offset, offset + 4096), offset + 4096 >= bytes.length);
    if (!names.has('[Content_Types].xml') || !names.has('xl/workbook.xml') || !names.has('xl/worksheets/sheet1.xml') || [...names].filter(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).length !== 1) throw Error();
  } catch { invalid(); }
}
export async function parseIntraXlsx(bytes: Uint8Array) {
  inspectIntraXlsx(bytes);
  try { return parseIntraRows(await readSheet(Buffer.from(bytes), { trim: false })); }
  catch (error) { if (error instanceof SupplyError) throw error; return invalid(); }
}
export async function readIntraUpload(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > INTRA_FILE_LIMIT) throw new SupplyError('INTRA_FILE_TOO_LARGE', 413);
  const reader = request.body?.getReader(); if (!reader) return invalid();
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > INTRA_FILE_LIMIT) { await reader.cancel(); throw new SupplyError('INTRA_FILE_TOO_LARGE', 413); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
