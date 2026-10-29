import { createHash, randomUUID } from 'node:crypto';
import { Unzip, UnzipInflate } from 'fflate';
import { z } from 'zod';
import type { User } from '@/contracts';
import { AuditError, assertAuditUser, type AuditDb } from './physical-audits';

export const AUDIT_FILE_LIMIT = 8 * 1024 * 1024;
export function inspectAuditFile(bytes: Uint8Array, original: string) {
  if (!bytes.length || bytes.length > AUDIT_FILE_LIMIT) throw new AuditError('FILE_TOO_LARGE', 413);
  const prefix = Buffer.from(bytes.slice(0, 16));
  let mime: string, ext: string;
  if (prefix.subarray(0, 5).toString() === '%PDF-') { mime = 'application/pdf'; ext = '.pdf'; }
  else if (prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { mime = 'image/png'; ext = '.png'; }
  else if (prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255) { mime = 'image/jpeg'; ext = '.jpg'; }
  else if (prefix.subarray(0, 4).toString() === 'RIFF' && prefix.subarray(8, 12).toString() === 'WEBP') { mime = 'image/webp'; ext = '.webp'; }
  else if (prefix[0] === 80 && prefix[1] === 75) {
    // Bound expanded bytes and entry count before allowing an XLSX into a parser.
    let total = 0, entries = 0; const names = new Set<string>();
    try {
      const zip = new Unzip(file => {
        if (++entries > 2000 || /(?:^|\/)vbaProject\.bin$/i.test(file.name) || file.originalSize! > 32 * 1024 * 1024) throw Error('archive limit');
        names.add(file.name);
        file.ondata = (error, data) => { if (error) throw error; total += data.length; if (total > 32 * 1024 * 1024) throw Error('archive limit'); };
        file.start();
      });
      zip.register(UnzipInflate); zip.push(bytes, true);
      if (!names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) throw Error('not xlsx');
    } catch { throw new AuditError('FILE_TYPE_INVALID', 422); }
    mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; ext = '.xlsx';
  } else throw new AuditError('FILE_TYPE_INVALID', 422);
  const stem = original.replace(/\.[^.]*$/, '').normalize('NFKC').replace(/[^\p{L}\p{N} _.-]/gu, '_').replace(/\.+/g, '.').slice(0, 145) || 'auditoria';
  return { mime, fileName: stem + ext, hash: createHash('sha256').update(bytes).digest('hex') };
}
export async function boundedAuditUpload(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new AuditError('INPUT_INVALID', 422);
  let length = 0; const chunks: Uint8Array[] = [];
  for (;;) { const r = await reader.read(); if (r.done) break; length += r.value.length; if (length > AUDIT_FILE_LIMIT + 65536) { await reader.cancel(); throw new AuditError('FILE_TOO_LARGE', 413); } chunks.push(r.value); }
  const bounded = new Request(request.url, { method: 'POST', headers: { 'Content-Type': request.headers.get('content-type') ?? '' }, body: Buffer.concat(chunks) });
  return bounded.formData();
}
export async function attachAuditFile(db: AuditDb, user: User, recordId: string, bytes: Uint8Array, name: string) {
  assertAuditUser(user, true); z.string().uuid().parse(recordId);
  const meta = inspectAuditFile(bytes, name);
  // Record lock serializes attachment limits and duplicate detection across concurrent uploads.
  const records = await db.query('SELECT id FROM fnet_audit_records WHERE id=$1::uuid FOR UPDATE', [recordId]);
  if (!records.length) throw new AuditError('NOT_FOUND', 404);
  const files = await db.query<{ id: string; byte_count: number; file_hash: string }>('SELECT id,byte_count,file_hash FROM fnet_audit_files WHERE record_id=$1::uuid', [recordId]);
  const duplicate = files.find(f => f.file_hash === meta.hash); if (duplicate) return { id: duplicate.id, alreadySaved: true };
  if (files.length >= 20 || files.reduce((n, f) => n + f.byte_count, 0) + bytes.length > 48 * 1024 * 1024) throw new AuditError('AUDIT_FILE_LIMIT', 422);
  const id = randomUUID();
  await db.query('INSERT INTO fnet_audit_files(id,record_id,file_name,mime_type,byte_count,file_hash,content,actor_id) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8::uuid) RETURNING id', [id, recordId, meta.fileName, meta.mime, bytes.length, meta.hash, Buffer.from(bytes), user.id]);
  return { id };
}
export async function auditDownload(db: AuditDb, user: User, id: string) {
  assertAuditUser(user); z.string().uuid().parse(id);
  const [file] = await db.query<{ content: Uint8Array; mime_type: string; file_name: string }>('SELECT content,mime_type,file_name FROM fnet_audit_files WHERE id=$1::uuid', [id]);
  if (!file) throw new AuditError('NOT_FOUND', 404);
  return file;
}
