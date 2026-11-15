import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), client: null as unknown }));
vi.mock('@/server/services/auth-sessions', () => ({ requireAdminSession: m.auth }));
vi.mock('@/server/prisma', () => ({ getPrismaClient: () => m.client }));
import { POST } from './route';
let pg: PGlite;
const actor = '00000000-0000-4000-8000-000000000001';
const csvRequest = (rows: string) => {
  const csv = 'ID Transaccion,ID Completo Transaccion,Fecha transaccion,Importe Total,Moneda,Numero de factura\n' + rows;
  const form = new FormData(); form.set('file', new File([csv], 'sintetico.csv', { type: 'text/csv' })); form.set('mode', 'commit');
  return new NextRequest('http://localhost:3001/api/mendel/transactions/import', { method: 'POST', headers: { origin: 'http://localhost:3001' }, body: form });
};
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE app_users(id UUID PRIMARY KEY); INSERT INTO app_users VALUES ('${actor}');`);
  await pg.exec(readFileSync('prisma/migrations/20260925_add_mendel_transactions/migration.sql', 'utf8'));
  await pg.exec(readFileSync('prisma/migrations/20261115_add_mendel_csv_archive/migration.sql', 'utf8'));
}, 20000);
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  await pg.exec('TRUNCATE mendel_csv_archives,mendel_purchase_detail_events,mendel_purchase_details,mendel_import_batches,mendel_transactions RESTART IDENTITY CASCADE');
  m.auth.mockResolvedValue({ ok: true, user: { id: actor, role: 'ADMIN', active: true } });
  const tx = {
    mendel_import_batches: { create: async ({ data }: { data: { fileHash: string; rowCount: number; insertedCount: number; updatedCount: number; importedBy: string } }) => (await pg.query<{id: string}>('INSERT INTO mendel_import_batches(file_hash,row_count,inserted_count,updated_count,imported_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [data.fileHash,data.rowCount,data.insertedCount,data.updatedCount,data.importedBy])).rows[0] },
    $executeRaw: async (strings: TemplateStringsArray, ...args: unknown[]) => { const sql = strings.reduce((out, part, i) => out + part + (i < args.length ? `$${i+1}` : ''), ''); return (await pg.query(sql, args)).affectedRows; },
    $executeRawUnsafe: async (sql: string, ...args: unknown[]) => (await pg.query(sql, args)).affectedRows,
  };
  m.client = {
    mendel_transactions: { findMany: async ({ where }: { where: { transactionId: { in: string[] } } }) => (await pg.query<{transactionId: string}>('SELECT transaction_id AS "transactionId" FROM mendel_transactions WHERE transaction_id = ANY($1::text[])', [where.transactionId.in])).rows },
    $transaction: async (fn: (t: typeof tx) => Promise<void>) => { await pg.exec('BEGIN'); try { await fn(tx); await pg.exec('COMMIT'); } catch (error) { await pg.exec('ROLLBACK'); throw error; } },
  };
});
describe('incremental import using an isolated database', () => {
  it('archives original files, preserves manual fields and accepts a late older purchase', async () => {
    expect((await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,10,ARS,F-1'))).status).toBe(200);
    await pg.query('UPDATE mendel_purchase_details SET oppen=true,requires_intra=true,manual_invoice=$1 WHERE transaction_id=$2', ['MANUAL','ABC']);
    const response = await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,12,ARS,F-2\nDEF,DEF-222,2026/09/01 10:00,20,ARS,F-3'));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ insertedCount: 1, updatedCount: 1 });
    expect((await pg.query('SELECT full_id,source_invoice,manual_invoice,oppen,requires_intra FROM mendel_purchase_details WHERE transaction_id=$1', ['ABC'])).rows[0]).toMatchObject({ full_id: 'ABC-111', source_invoice: 'F-2', manual_invoice: 'MANUAL', oppen: true, requires_intra: true });
    expect((await pg.query('SELECT batch_id FROM mendel_csv_archives')).rows).toHaveLength(2);
  });
  it('rolls back the complete import when a known abbreviated ID belongs to a different full ID', async () => {
    expect((await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,10,ARS,F-1'))).status).toBe(200);
    const response = await POST(csvRequest('XYZ,XYZ-222,2026/10/02 10:00,10,ARS,F-2\nABC,ABC-999,2026/10/02 10:00,10,ARS,F-3'));
    expect(response.status).toBe(409);
    expect((await pg.query('SELECT transaction_id FROM mendel_transactions')).rows).toHaveLength(1);
    expect((await pg.query('SELECT batch_id FROM mendel_csv_archives')).rows).toHaveLength(1);
  });
  it('imports more than one batch and skips an invalid row without losing valid rows', async () => {
    const lines = Array.from({ length: 501 }, (_, i) => `ID${i},ID${i}-FULL,2026/10/02 10:00,10,ARS,F-${i}`);
    lines.push('INVALID,INVALID-FULL,2026/10/02 10:00,mal,ARS,F-X');
    const response = await POST(csvRequest(lines.join('\n')));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ insertedCount: 501, invalidRows: 1 });
    expect((await pg.query('SELECT transaction_id FROM mendel_transactions')).rows).toHaveLength(501);
    expect((await pg.query('SELECT invalid_count FROM mendel_csv_archives')).rows[0]).toMatchObject({ invalid_count: 1 });
  });
});
