import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { parseInitialSupplySources } from './import-initial-supply-sources.mjs';
let db;
const invoice = '00000000-0000-4000-8000-000000000001', line = '00000000-0000-4000-8000-000000000002', handoff = '00000000-0000-4000-8000-000000000003';
beforeAll(async () => {
 db = new PGlite(); await db.exec(readFileSync('prisma/migrations/20261004_add_supply_control/migration.sql','utf8'));
 await db.query("INSERT INTO supply_invoices (id,request_key,request_hash,supplier,supplier_key,document_type,number,number_key,invoice_date,amount,currency,created_by,updated_at) VALUES ($1,$1,'hash','Proveedor','PROVEEDOR','A','123','123','2026-10-04',100,'ARS',$1,now())",[invoice]);
 await db.query("INSERT INTO supply_invoice_lines (id,invoice_id,position,description,quantity,available_quantity,unit) VALUES ($1,$2,0,'Material',10,10,'unidad')",[line,invoice]);
 await db.query("INSERT INTO supply_handoffs (id,line_id,request_key,request_hash,technician,quantity_given,remaining,assigned_at,due_at,created_by) VALUES ($1,$2,$1,'hash','Tecnico',3,3,now(),now(),$3)",[handoff,line,invoice]);
}, 20000);
afterAll(async () => { await db?.close(); });
describe('PostgreSQL inventory constraints', () => {
 it('executes the complete owned schema in PostgreSQL', async () => { const result = await db.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'supply_%'"); expect(result.rows[0].count).toBe(7); });
 it('rejects negative stock independently of application validation', async () => { await expect(db.query('UPDATE supply_invoice_lines SET available_quantity = -1 WHERE id = $1',[line])).rejects.toThrow(); });
 it('only one of two writes with the same version can succeed', async () => {
  const sql = 'UPDATE supply_invoice_lines SET available_quantity=available_quantity-7,version=version+1 WHERE id=$1 AND version=0 AND available_quantity>=7 RETURNING id';
  const first = await db.query(sql,[line]), second = await db.query(sql,[line]); expect(first.rows).toHaveLength(1); expect(second.rows).toHaveLength(0);
  expect((await db.query('SELECT available_quantity::text AS quantity FROM supply_invoice_lines WHERE id=$1',[line])).rows[0].quantity).toBe('3.000');
 });
 it('does not allow a handoff to regain more material than originally delivered', async () => { await expect(db.query('UPDATE supply_handoffs SET remaining=4 WHERE id=$1',[handoff])).rejects.toThrow(); });
 it('rolls back all accounting changes when a later statement fails', async () => {
  await db.query('BEGIN'); await db.query('UPDATE supply_handoffs SET remaining=1 WHERE id=$1',[handoff]);
  try { await db.query('UPDATE supply_invoice_lines SET available_quantity=-1 WHERE id=$1',[line]); } catch { await db.query('ROLLBACK'); }
  expect((await db.query('SELECT remaining::text AS remaining FROM supply_handoffs WHERE id=$1',[handoff])).rows[0].remaining).toBe('3.000');
 });
 it('refuses foreign or oversized source import payloads', () => { expect(() => parseInitialSupplySources(gzipSync(JSON.stringify({ version:1, deleteEverything:true })).toString('base64'))).toThrow(); expect(() => parseInitialSupplySources('A'.repeat(500001))).toThrow(); });
});
