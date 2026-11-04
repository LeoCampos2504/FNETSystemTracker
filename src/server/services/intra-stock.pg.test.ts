import { PGlite } from '@electric-sql/pglite';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/contracts';
import type { IntraLine, IntraTarget } from '@/contracts/intra-stock';
import { intraFuelTotals } from '@/lib/intra-stock';
import type { OperationsActor } from './operations';
const mock=vi.hoisted(()=>({db:{} as Record<string,unknown>}));
vi.mock('@/server/prisma',()=>({getPrismaClient:()=>mock.db}));
import { changeIntraLink, intraHistory, intraState, saveIntraSnapshot } from './intra-stock';
const actor:OperationsActor={user:{id:'00000000-0000-4000-8000-000000000001',name:'Admin de prueba',role:'ADMIN',active:true} as User,allowed:null};
const row:IntraLine={id:'a'.repeat(64)+':1',date:'2026-11-01',invoice:'0001-000001',supplier:'Proveedor ficticio',scope:'MED - NON - Salta',operation:'NON',location:'Salta',product:'Gasoil Premium',quantity:100,net:1000,liquidated:'NO',fuel:true,duplicate:false};
const target:IntraTarget={id:'fuel-1',kind:'FUEL',hash:'b'.repeat(64),operation:'NON',description:'Gasoil',quantity:120,date:'2026-11-01',formCode:'FO-26-000001',siteCode:'ST00001'};
type Query={query:<T>(s:string,p:unknown[])=>Promise<{rows:T[];affectedRows?:number}>};
function adapter(db:Query){
  const query=<T>(parts:TemplateStringsArray,values:unknown[])=>db.query<T>(parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values);
  return {$queryRaw:<T>(parts:TemplateStringsArray,...values:unknown[])=>query<T>(parts,values).then(r=>r.rows),$executeRaw:(parts:TemplateStringsArray,...values:unknown[])=>query(parts,values).then(r=>r.affectedRows??0)};
}
let pg:PGlite;
const save=(version=0,rows=[row],scopes=[row.scope])=>saveIntraSnapshot(actor,rows,{version,scopes,complete:true},'Insumos-prueba.xlsx');
const link=(version=1,quantity=60,extra={})=>changeIntraLink(actor,{action:'link',version,lineId:row.id,targetId:target.id,targetKind:target.kind,targetHash:target.hash,quantity,...extra},async()=>[target]);
beforeEach(async()=>{
 pg=new PGlite();
 await pg.exec('CREATE TABLE app_users(id UUID PRIMARY KEY,name TEXT NOT NULL); CREATE TABLE ops_events(id UUID PRIMARY KEY,resource_key TEXT NOT NULL,action TEXT NOT NULL,actor_id UUID REFERENCES app_users(id),detail JSONB NOT NULL,created_at TIMESTAMPTZ DEFAULT clock_timestamp());');
 await pg.query('INSERT INTO app_users VALUES($1,$2)',[actor.user.id,actor.user.name]);
 mock.db={...adapter(pg),$transaction:<T>(fn:(tx:ReturnType<typeof adapter>)=>Promise<T>)=>pg.transaction(tx=>fn(adapter(tx)))};
});
afterEach(async()=>{await pg.close();});
describe('shared Intra snapshots and immutable history on existing ops_events, disposable PostgreSQL only',()=>{
 it('persists source rows, actor/date, links and disappearance without deleting history',async()=>{
  await save(); await link(); await save(2,[]);
  const state=await intraState(actor);
  expect(state.records[0]).toMatchObject({present:false,invoice:row.invoice,quantity:100});expect(state.records[0].firstSeen).toBeTruthy();expect(state.records[0].missingSince).toBeTruthy();
  expect(state.allocations[0]).toMatchObject({active:true,quantity:60,createdBy:actor.user.name});
  const history=await intraHistory(actor);expect(history.map(h=>h.version)).toEqual([3,2,1]);expect(history.every(h=>h.actor===actor.user.name&&h.at)).toBe(true);
  const first=(await pg.query<{detail:{state:{records:unknown[]}}}>('SELECT detail FROM ops_events ORDER BY created_at LIMIT 1')).rows[0];expect(first.detail.state.records).toHaveLength(1);
  expect(intraFuelTotals({...state,targets:[target]})[0]).toMatchObject({pending:0,used:0,unlinked:60});
 });
 it('does not add quantities or events for an identical reordered reimport and keeps original firstSeen',async()=>{
  await save();const first=await intraState(actor);
  expect(await save(1)).toMatchObject({unchanged:true,version:1});expect(await intraHistory(actor)).toHaveLength(1);
  expect((await intraState(actor)).records[0].firstSeen).toBe(first.records[0].firstSeen);
 });
 it('supports several invoices for one usage, rejects over-allocation and stale writes',async()=>{
  const second={...row,id:'c'.repeat(64)+':1',invoice:'0001-000002',quantity:100};
  await save(0,[row,second]); await link(1,60);
  await changeIntraLink(actor,{action:'link',version:2,lineId:second.id,targetId:target.id,targetKind:'FUEL',targetHash:target.hash,quantity:60},async()=>[target]);
  await expect(link(3,1)).rejects.toMatchObject({code:'INTRA_ALLOCATION_INVALID'});
  await expect(save(1)).rejects.toMatchObject({code:'STALE_VERSION'});
  expect((await intraState(actor)).allocations).toHaveLength(2);
 });
 it('reverses a link with removal actor/date and preserves its original data',async()=>{
  await save();await link();const [previous]=(await intraState(actor)).allocations;
  await changeIntraLink(actor,{action:'unlink',version:2,id:previous.id},async()=>[]);
  expect((await intraState(actor)).allocations[0]).toMatchObject({id:previous.id,active:false,quantity:60,createdBy:actor.user.name,removedBy:actor.user.name});
  expect((await intraState(actor)).allocations[0].removedAt).toBeTruthy();
 });
 it('rejects missing/changed sources, wrong operation and a stale target hash without any audit event',async()=>{
  await save();
  await expect(link(1,1,{targetHash:'d'.repeat(64)})).rejects.toMatchObject({code:'INTRA_SOURCE_CHANGED'});
  await expect(changeIntraLink(actor,{action:'link',version:1,lineId:row.id,targetId:target.id,targetKind:'FUEL',targetHash:target.hash,quantity:1},async()=>[{...target,operation:'BAS'}])).rejects.toMatchObject({code:'INTRA_ALLOCATION_INVALID'});
  expect(await intraHistory(actor)).toHaveLength(1);
 });
 it('does not treat a missing locality as empty without explicit confirmation',async()=>{
  const other={...row,id:'e'.repeat(64)+':1',scope:'MED - BAS - Azul',operation:'BAS',location:'Azul'};
  await save(0,[row,other],[row.scope,other.scope]);await save(1,[]);
  expect((await intraState(actor)).records.find(r=>r.id===other.id)?.present).toBe(true);
 });
 it('fails closed for coordinators, inactive users and CTIC without touching storage',async()=>{
  for(const bad of [{...actor,user:{...actor.user,role:'COORDINATOR' as const}},{...actor,user:{...actor.user,active:false}},{...actor,ctic:true},{...actor,allowed:['NON - MPC']}]) {
   await expect(intraState(bad)).rejects.toMatchObject({code:'FORBIDDEN'});
   await expect(saveIntraSnapshot(bad,[row],{version:0,scopes:[row.scope],complete:true},'test.xlsx')).rejects.toMatchObject({code:'FORBIDDEN'});
  }
  expect(await intraHistory(actor)).toHaveLength(0);
 });
 it('rolls back the snapshot and version if saving immutable history fails',async()=>{
  await pg.exec("ALTER TABLE ops_events ADD CONSTRAINT rejected CHECK(action <> 'INTRA_STOCK_CONTROL')");
  await expect(save()).rejects.toThrow();expect((await intraState(actor)).version).toBe(0);
 });
 it('paginates the full history instead of dropping older imports',async()=>{
  await save();await link();expect((await intraHistory(actor,2)).map(h=>h.version)).toEqual([1]);
 });
 it('does not reuse capacity from a stale link until that link is explicitly retired',async()=>{
  const second={...row,id:'f'.repeat(64)+':1',invoice:'0001-000002'};
  const changed={...target,hash:'c'.repeat(64),quantity:60};
  await save(0,[row,second]);await link(1,60);
  const input={action:'link' as const,version:2,lineId:second.id,targetId:changed.id,targetKind:changed.kind,targetHash:changed.hash,quantity:1};
  await expect(changeIntraLink(actor,input,async()=>[changed])).rejects.toMatchObject({code:'INTRA_ALLOCATION_INVALID'});
  expect(await intraHistory(actor)).toHaveLength(2);
  const [previous]=(await intraState(actor)).allocations;
  await changeIntraLink(actor,{action:'unlink',version:2,id:previous.id},async()=>[]);
  await changeIntraLink(actor,{...input,version:3,quantity:60},async()=>[changed]);
  expect((await intraState(actor)).allocations.map(a=>a.active)).toEqual([false,true]);
 });
 it('loads source evidence before opening the ledger transaction, without holding its timeout or lock during source reads',async()=>{
  await save();
  const original=mock.db.$transaction as (fn:unknown)=>Promise<unknown>;let inTransaction=false;
  mock.db.$transaction=async(fn:unknown)=>{inTransaction=true;try{return await original(fn);}finally{inTransaction=false;}};
  await changeIntraLink(actor,{action:'link',version:1,lineId:row.id,targetId:target.id,targetKind:target.kind,targetHash:target.hash,quantity:40},async()=>{expect(inTransaction).toBe(false);return [target];});
  expect((await intraState(actor)).allocations[0].quantity).toBe(40);
 });
});
