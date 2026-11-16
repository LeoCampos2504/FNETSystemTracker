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
const csvRequest = (rows: string, headers = 'ID Transaccion,ID Completo Transaccion,Fecha transaccion,Importe Total,Moneda,Numero de factura') => {
  const csv = headers + '\n' + rows;
  const form = new FormData(); form.set('file', new File([csv], 'sintetico.csv', { type: 'text/csv' })); form.set('mode', 'commit');
  return new NextRequest('http://localhost:3001/api/mendel/transactions/import', { method: 'POST', headers: { origin: 'http://localhost:3001' }, body: form });
};
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE app_users(id UUID PRIMARY KEY); INSERT INTO app_users VALUES ('${actor}');`);
  await pg.exec(readFileSync('prisma/migrations/20260925_add_mendel_transactions/migration.sql', 'utf8'));
  await pg.exec(readFileSync('prisma/migrations/20261115_add_mendel_csv_archive/migration.sql', 'utf8'));
  await pg.exec(readFileSync('prisma/migrations/20261116_add_mendel_purchase_comments/migration.sql', 'utf8'));
}, 20000);
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  await pg.exec('TRUNCATE mendel_csv_archives,mendel_purchase_detail_events,mendel_purchase_details,mendel_import_batches,mendel_transactions RESTART IDENTITY CASCADE');
  m.auth.mockResolvedValue({ ok: true, user: { id: actor, role: 'ADMIN', active: true } });
  const tx = {
    mendel_import_batches: { create: async ({ data }: { data: { fileHash: string; rowCount: number; insertedCount: number; updatedCount: number; importedBy: string } }) => (await pg.query<{id: string}>('INSERT INTO mendel_import_batches(file_hash,row_count,inserted_count,updated_count,imported_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [data.fileHash,data.rowCount,data.insertedCount,data.updatedCount,data.importedBy])).rows[0] },
    $executeRaw: async (strings: TemplateStringsArray, ...args: unknown[]) => { const sql = strings.reduce((out, part, i) => out + part + (i < args.length ? `$${i+1}` : ''), ''); return (await pg.query(sql, args)).affectedRows; },
    $executeRawUnsafe: async (sql: string, ...args: unknown[]) => (await pg.query(sql, args)).affectedRows,
    mendel_form_references: { deleteMany: async () => ({}), createMany: async () => ({}) },
  };
  m.client = {
    mendel_transactions: { findMany: async ({ where }: { where: { transactionId: { in: string[] } } }) => (await pg.query<{transactionId: string}>('SELECT transaction_id AS "transactionId" FROM mendel_transactions WHERE transaction_id = ANY($1::text[])', [where.transactionId.in])).rows },
    $queryRaw: async (strings: TemplateStringsArray, ...args: unknown[]) => { const sql = strings.reduce((out, part, i) => out + part + (i < args.length ? `$${i+1}` : ''), ''); return (await pg.query(sql, args)).rows; },
    $transaction: async (fn: (t: typeof tx) => Promise<void>) => { await pg.exec('BEGIN'); try { await fn(tx); await pg.exec('COMMIT'); } catch (error) { await pg.exec('ROLLBACK'); throw error; } },
  };
});
describe('incremental import using an isolated database', () => {
  it('updates Mendel notes while keeping manual invoice, controls and observation', async () => {
    const headers='ID Transaccion,ID Completo Transaccion,Fecha transaccion,Importe Total,Moneda,Numero de factura,Notas';
    expect((await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,10,ARS,F-1,nota inicial',headers))).status).toBe(200);
    await pg.query("UPDATE mendel_purchase_details SET oppen=true,requires_intra=true,manual_invoice='MANUAL' WHERE transaction_id='ABC-111'");
    await pg.query(`INSERT INTO mendel_purchase_detail_events(id,transaction_id,actor_id,before,after) VALUES ('00000000-0000-4000-8000-000000000002','ABC-111',$1,'{}','{"observation":"nota FNET","version":1}')`,[actor]);
    expect((await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,12,ARS,F-2,nota actualizada',headers))).status).toBe(200);
    expect((await pg.query("SELECT comment FROM mendel_purchase_source_comments WHERE transaction_id='ABC-111'")).rows[0]).toEqual({comment:'nota actualizada'});
    expect((await pg.query("SELECT manual_invoice,oppen,requires_intra FROM mendel_purchase_details WHERE transaction_id='ABC-111'")).rows[0]).toEqual({manual_invoice:'MANUAL',oppen:true,requires_intra:true});
    expect((await pg.query("SELECT after->>'observation' AS observation FROM mendel_purchase_detail_events WHERE transaction_id='ABC-111'")).rows[0]).toEqual({observation:'nota FNET'});
    expect((await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,12,ARS,F-3'))).status).toBe(200);
    expect((await pg.query("SELECT comment FROM mendel_purchase_source_comments WHERE transaction_id='ABC-111'")).rows[0]).toEqual({comment:'nota actualizada'});
  });
  it('archives original files, preserves manual fields and accepts a late older purchase', async () => {
    expect((await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,10,ARS,F-1'))).status).toBe(200);
    await pg.query('UPDATE mendel_purchase_details SET oppen=true,requires_intra=true,manual_invoice=$1 WHERE transaction_id=$2', ['MANUAL','ABC-111']);
    const response = await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,12,ARS,F-2\nDEF,DEF-222,2026/09/01 10:00,20,ARS,F-3'));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ insertedCount: 1, updatedCount: 1 });
    expect((await pg.query('SELECT full_id,source_invoice,manual_invoice,oppen,requires_intra FROM mendel_purchase_details WHERE transaction_id=$1', ['ABC-111'])).rows[0]).toMatchObject({ full_id: 'ABC-111', source_invoice: 'F-2', manual_invoice: 'MANUAL', oppen: true, requires_intra: true });
    expect((await pg.query('SELECT batch_id FROM mendel_csv_archives')).rows).toHaveLength(2);
  });
  it('imports different full IDs independently when they share an abbreviated prefix', async () => {
    expect((await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,10,ARS,F-1'))).status).toBe(200);
    const response = await POST(csvRequest('XYZ,XYZ-222,2026/10/02 10:00,10,ARS,F-2\nABC,ABC-999,2026/10/02 10:00,10,ARS,F-3'));
    expect(response.status).toBe(200);
    expect((await pg.query('SELECT transaction_id FROM mendel_transactions')).rows).toHaveLength(3);
    expect((await pg.query('SELECT batch_id FROM mendel_csv_archives')).rows).toHaveLength(2);
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
  it('does not erase existing source fields when a later CSV omits their columns', async () => {
    const headers='ID Transaccion,ID Completo Transaccion,Fecha transaccion,Importe Total,Moneda,Numero de factura,Categoria transaccion,Hay ticket,Estado transaccion';
    expect((await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,10,ARS,F-1,Materiales,SI,CONFIRMADA', headers))).status).toBe(200);
    expect((await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,12,ARS,F-2'))).status).toBe(200);
    const result = await pg.query('SELECT transaction_category,has_receipt,transaction_status,total_amount FROM mendel_transactions WHERE transaction_id=$1', ['ABC-111']);
    expect(result.rows[0]).toMatchObject({ transaction_category:'Materiales', has_receipt:true, transaction_status:'CONFIRMADA', total_amount:'12.00' });
  });
  it('preserves controls for an existing verified legacy mapping', async () => {
    await pg.query("INSERT INTO mendel_transactions(transaction_id,transaction_date,total_amount,currency,updated_at) VALUES ('ABC',NOW(),10,'ARS',NOW())");
    await pg.query("INSERT INTO mendel_purchase_details(transaction_id,full_id,oppen,manual_invoice) VALUES ('ABC','ABC-111',true,'MANUAL')");
    const response = await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,12,ARS,F-2'));
    expect(response.status).toBe(200);
    expect((await pg.query("SELECT transaction_id,oppen,manual_invoice FROM mendel_purchase_details")).rows).toEqual([{transaction_id:'ABC',oppen:true,manual_invoice:'MANUAL'}]);
  });
  it('does not silently link an unverified historic short ID', async () => {
    await pg.query("INSERT INTO mendel_transactions(transaction_id,transaction_date,total_amount,currency,updated_at) VALUES ('ABC',NOW(),10,'ARS',NOW())");
    const response = await POST(csvRequest('ABC,ABC-111,2026/10/02 10:00,12,ARS,F-2'));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({invalidRows:1,errors:[{line:2}]});
    expect((await pg.query('SELECT transaction_id FROM mendel_transactions')).rows).toHaveLength(1);
  });
  it('accepts an incremental file with the full ID and no abbreviated-ID column', async () => {
    const headers='ID Completo Transaccion,Fecha transaccion,Importe Total,Moneda';
    const response = await POST(csvRequest('FULL-IDENTIFIER-1,2026/08/01 10:00,12,ARS', headers));
    expect(response.status).toBe(200);
    expect((await pg.query('SELECT transaction_id FROM mendel_transactions')).rows).toEqual([{transaction_id:'FULL-IDENTIFIER-1'}]);
  });
});
