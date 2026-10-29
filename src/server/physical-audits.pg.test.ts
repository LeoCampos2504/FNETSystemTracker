import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, expect, it } from 'vitest';
import type { User } from '@/contracts';
import { auditHistory, auditOverview, auditWrite, type AuditDb } from './physical-audits';
import { attachAuditFile, auditDownload, inspectAuditFile } from './physical-audit-files';
import { zipSync, strToU8 } from 'fflate';
const admin = { id: '00000000-0000-4000-8000-000000000001', role: 'ADMIN', active: true, name: 'Admin de prueba' } as User;
const reader = { ...admin, id: '00000000-0000-4000-8000-000000000002', role: 'COORDINATOR', name: 'Consulta' } as User;
const data = { name: 'Persona ficticia', role: 'Líder', sector: 'PCS', location: 'Localidad', status: 'Realizada' as const, lastDate: '2026-10-29', nextDate: '2027-01-29', notes: 'Nota sintética', exception: '' };
let pg: PGlite, db: AuditDb;
async function write(input: Parameters<typeof auditWrite>[2], user = admin) { return pg.transaction(async tx => auditWrite({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows }, user, input)); }
async function seed() { await write({ action: 'import', rows: [{ cuil: '20000000001', data }] }); return (await auditOverview(db, admin))[0]; }
beforeEach(async () => {
  pg = new PGlite(); db = { query: async <T>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows };
  await pg.exec('CREATE TABLE app_users(id UUID PRIMARY KEY,name TEXT);');
  for (const u of [admin, reader]) await pg.query('INSERT INTO app_users VALUES($1,$2)', [u.id, u.name]);
  await pg.exec(readFileSync(new URL('../../prisma/migrations/20261029_add_physical_audits/migration.sql', import.meta.url), 'utf8'));
});
afterEach(async () => { await pg.close(); });
it('allows all active roles to read with masked CUIL, but only Admin can write', async () => {
  await seed();
  for (const role of ['COORDINATOR', 'MANAGER', 'TECHNICIAN'] as const) {
    const user = { ...reader, role };
    expect((await auditOverview(db, user))[0].cuil).toBe('•••••••0001');
    await expect(write({ action: 'import', rows: [{ cuil: '20000000002', data }] }, user)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
  await expect(auditOverview(db, { ...reader, active: false })).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it('imports idempotently and reports changed rows without replacing existing history', async () => {
  const r = await seed();
  expect(await write({ action: 'import', rows: [{ cuil: '20000000001', data }] })).toEqual({ inserted: 0, unchanged: 1, conflicts: [] });
  expect(await write({ action: 'import', rows: [{ cuil: '20000000001', data: { ...data, notes: 'Otra' } }] })).toEqual({ inserted: 0, unchanged: 0, conflicts: [r.id] });
  expect((await auditOverview(db, admin))[0].notes).toBe(data.notes);
  expect(await auditHistory(db, reader, r.id)).toHaveLength(1);
});
it('appends immutable history with author/date, prevents stale edits and accepts an identical retry', async () => {
  const r = await seed(), requestId = crypto.randomUUID();
  const input = { action: 'save' as const, id: r.id, version: r.version, requestId, kind: 'AUDIT' as const, data: { ...data, lastDate: '2026-11-01', nextDate: '2027-02-01' } };
  const saved = await write(input); expect(saved).toHaveProperty('recordId');
  expect(await write(input)).toHaveProperty('alreadySaved', true);
  await expect(write({ ...input, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'STALE_VERSION' });
  await expect(write({ ...input, data: { ...input.data, notes: 'Different' } })).rejects.toMatchObject({ code: 'REQUEST_KEY_REUSED' });
  const history = await auditHistory(db, reader, r.id);
  expect(history).toHaveLength(2); expect(history[1].data).toEqual(data); expect(history[0].actor_name).toBe(admin.name); expect(history[0].created_at).toBeTruthy();
});
it('rolls back current state and history together on a failed transaction', async () => {
  await expect(pg.transaction(async tx => { await auditWrite({ query: async <T>(sql: string, p: unknown[] = []) => (await tx.query<T>(sql, p)).rows }, admin, { action: 'import', rows: [{ cuil: '20000000001', data }] }); throw Error('rollback'); })).rejects.toThrow('rollback');
  expect(await auditOverview(db, admin)).toEqual([]);
  expect(await db.query('SELECT id FROM fnet_audit_records')).toEqual([]);
});
it('returns the saved person and record on an uncertain creation retry, without duplicates', async () => {
  const input = { action: 'save' as const, id: null, cuil: '20000000001', version: 0, requestId: crypto.randomUUID(), kind: 'EDIT' as const, data };
  const first = await write(input);
  expect(await write(input)).toMatchObject({ ...first, alreadySaved: true });
  expect(await auditOverview(db, admin)).toHaveLength(1);
});
it('keeps private files across edits, authenticates downloads and does not duplicate an identical attachment', async () => {
  const r = await seed(), record = (await auditHistory(db, admin, r.id))[0];
  const bytes = Buffer.from('%PDF-1.4 synthetic');
  const attach = (u = admin) => pg.transaction(tx => attachAuditFile({ query: async <T>(sql: string, p: unknown[] = []) => (await tx.query<T>(sql, p)).rows }, u, record.id, bytes, '../../fake.html'));
  const file = await attach(); expect(await attach()).toMatchObject({ id: file.id, alreadySaved: true });
  await expect(attach(reader)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect((await auditDownload(db, reader, file.id)).mime_type).toBe('application/pdf');
  await expect(auditDownload(db, { ...reader, active: false }, file.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await write({ action: 'save', id: r.id, version: r.version, requestId: crypto.randomUUID(), kind: 'EDIT', data: { ...data, notes: 'Nueva nota' } });
  const history = await auditHistory(db, reader, r.id); expect(history[0].files).toEqual([]); expect(history[1].files).toHaveLength(1);
});
it('validates file content, rejects macros/oversized input and only accepts bounded XLSX archives', () => {
  expect(() => inspectAuditFile(Buffer.from('<html>bad</html>'), 'fake.pdf')).toThrow();
  expect(() => inspectAuditFile(new Uint8Array(8388609), 'big.pdf')).toThrow();
  const book = { '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<workbook/>') };
  expect(inspectAuditFile(zipSync(book), 'test.xlsx').mime).toContain('spreadsheetml');
  expect(() => inspectAuditFile(zipSync({ ...book, 'xl/vbaProject.bin': new Uint8Array(5) }), 'macro.xlsx')).toThrow();
  expect(() => inspectAuditFile(zipSync({ 'not-a-workbook': new Uint8Array(4) }), 'fake.xlsx')).toThrow();
});
