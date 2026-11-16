import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), client: null as unknown }));
vi.mock('@/server/services/auth-sessions', () => ({ requireAdminSession: m.auth }));
vi.mock('@/server/prisma', () => ({ getPrismaClient: () => m.client }));
import { POST, PUT } from './route';
let pg: PGlite;
const actor='00000000-0000-4000-8000-000000000001';
function request(shortId='ABC',fullId='ABC-111') { return new NextRequest('http://localhost:3001/api/mendel/identity-review', { method:'PUT', headers:{origin:'http://localhost:3001','content-type':'application/json'}, body:JSON.stringify({shortId,fullId}) }); }
function preview() { const form=new FormData(); form.set('file',new File(['ID Transaccion,ID Completo Transaccion,Fecha transaccion,Importe Total,Moneda,Comercio,Numero de factura\nABC,ABC-111,2026/10/02 10:00,12,ARS,Proveedor,F-1'], 'fake.csv')); return new NextRequest('http://localhost:3001/api/mendel/identity-review',{method:'POST',headers:{origin:'http://localhost:3001'},body:form}); }
beforeAll(async () => { pg=new PGlite(); await pg.exec(`CREATE TABLE app_users(id UUID PRIMARY KEY); INSERT INTO app_users VALUES ('${actor}')`); await pg.exec(readFileSync('prisma/migrations/20260925_add_mendel_transactions/migration.sql','utf8')); await pg.exec(readFileSync('prisma/migrations/20261115_add_mendel_csv_archive/migration.sql','utf8')); },20000);
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.exec('TRUNCATE mendel_csv_archives,mendel_purchase_detail_events,mendel_purchase_details,mendel_import_batches,mendel_transactions RESTART IDENTITY CASCADE');
  await pg.query("INSERT INTO mendel_transactions(transaction_id,transaction_date,total_amount,currency,merchant,updated_at) VALUES ('ABC',NOW(),12,'ARS','Proveedor',NOW())");
  m.auth.mockResolvedValue({ok:true,user:{id:actor,role:'ADMIN',active:true}});
  const tx={ $queryRaw: async (s: TemplateStringsArray,...a:unknown[]) => (await pg.query(s.reduce((v,p,i)=>v+p+(i<a.length?`$${i+1}`:''),''),a)).rows, $executeRaw: async (s:TemplateStringsArray,...a:unknown[]) => (await pg.query(s.reduce((v,p,i)=>v+p+(i<a.length?`$${i+1}`:''),''),a)).affectedRows };
  m.client={...tx,$transaction:async (fn:(t:typeof tx)=>Promise<unknown>)=>{ await pg.exec('BEGIN'); try { const result=await fn(tx); await pg.exec('COMMIT'); return result; } catch(e) { await pg.exec('ROLLBACK'); throw e; } }};
});
describe('manual historical identity review',()=>{
  it('compares the CSV and historical fields without linking',async()=>{ const response=await POST(preview()); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({candidates:[{historical:{transactionId:'ABC',merchant:'Proveedor'},csv:{fullId:'ABC-111',invoice:'F-1'}}]}); expect((await pg.query('SELECT * FROM mendel_purchase_details')).rows).toHaveLength(0); });
  it('links only on confirmation and preserves prior manual controls and observation',async()=>{ await pg.query("INSERT INTO mendel_purchase_details(transaction_id,oppen,manual_invoice,version) VALUES ('ABC',true,'MANUAL',1)"); await pg.query("INSERT INTO mendel_purchase_detail_events(id,transaction_id,actor_id,before,after) VALUES ('00000000-0000-4000-8000-000000000002','ABC',$1,'{}'::jsonb,'{\"version\":1,\"observation\":\"Conservar\"}'::jsonb)",[actor]); const response=await PUT(request()); expect(response.status).toBe(200); expect(await response.json()).toHaveProperty('createdAt'); expect((await pg.query("SELECT full_id,oppen,manual_invoice,version FROM mendel_purchase_details WHERE transaction_id='ABC'")).rows[0]).toEqual({full_id:'ABC-111',oppen:true,manual_invoice:'MANUAL',version:2}); expect((await pg.query("SELECT after->>'observation' AS note FROM mendel_purchase_detail_events ORDER BY (after->>'version')::int DESC LIMIT 1")).rows[0]).toEqual({note:'Conservar'}); });
  it('prevents reuse of a full ID and rejects already-linked records',async()=>{ expect((await PUT(request())).status).toBe(200); expect((await PUT(request())).status).toBe(409); await pg.query("INSERT INTO mendel_transactions(transaction_id,transaction_date,total_amount,currency,updated_at) VALUES ('ABC-',NOW(),12,'ARS',NOW())"); expect((await PUT(request('ABC-','ABC-111'))).status).toBe(409); expect((await pg.query("SELECT full_id FROM mendel_purchase_details WHERE transaction_id='ABC-'")).rows).toHaveLength(0); });
  it('does not merge an independently existing full-ID transaction',async()=>{ await pg.query("INSERT INTO mendel_transactions(transaction_id,transaction_date,total_amount,currency,updated_at) VALUES ('ABC-111',NOW(),12,'ARS',NOW())"); expect((await PUT(request())).status).toBe(409); });
  it('requires an authenticated admin and rejects cross-site confirmation',async()=>{ m.auth.mockResolvedValueOnce({ok:false,response:Response.json({}, {status:403})}); expect((await PUT(request())).status).toBe(403); const foreign=new NextRequest('http://localhost:3001/api/mendel/identity-review',{method:'PUT',headers:{origin:'https://other.invalid','content-type':'application/json'},body:JSON.stringify({shortId:'ABC',fullId:'ABC-111'})}); expect((await PUT(foreign)).status).toBe(403); });
});
