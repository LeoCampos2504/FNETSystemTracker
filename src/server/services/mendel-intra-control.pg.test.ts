import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import type {User} from '@/contracts';
import {mendelIntraInput,type MendelIntraInput} from '@/server/mendel-intra-input';
import {confirmIntra,intraOverview,purchaseIntraStates,intraSourceHash,type IntraDb,type IntraPurchase} from './mendel-intra-control';

const admin={id:'00000000-0000-4000-8000-000000000001',name:'Admin sintético',role:'ADMIN',active:true} as User;
const other={...admin,id:'00000000-0000-4000-8000-000000000002',name:'Otro admin sintético'};
const source:IntraPurchase={transactionId:'SYNTHETIC-001',transactionDate:'2026-10-15T11:00:00.000Z',userName:'Persona ficticia',merchant:'Comercio de prueba',totalAmount:'25000.00',currency:'ARS',budget:'CIVIL - TEST'};
let pg:PGlite,db:IntraDb;
const transaction=(input:MendelIntraInput,user=admin)=>pg.transaction(tx=>confirmIntra({query:async<T>(s:string,p:unknown[]=[]) => (await tx.query<T>(s,p)).rows},user,input));
const read=async()=> (await intraOverview(db,admin,source.transactionId)).state;
async function input(changes:Partial<MendelIntraInput>={}):Promise<MendelIntraInput>{const s=await read();return {transactionId:source.transactionId,uploaded:true,downloaded:null,requestId:crypto.randomUUID(),expectedEventId:s.eventId,sourceHash:s.sourceHash,...changes};}
beforeEach(async()=>{
  pg=new PGlite();db={query:async<T>(s:string,p:unknown[]=[]) => (await pg.query<T>(s,p)).rows};
  await pg.exec('CREATE TABLE app_users(id UUID PRIMARY KEY,name TEXT);');
  for(const u of [admin,other])await pg.query('INSERT INTO app_users VALUES($1,$2)',[u.id,u.name]);
  await pg.exec(readFileSync(new URL('../../../prisma/migrations/20260925_add_mendel_transactions/migration.sql',import.meta.url),'utf8'));
  const ops=readFileSync(new URL('../../../prisma/migrations/20261005_add_coordinator_operations/migration.sql',import.meta.url),'utf8');
  await pg.exec(ops.match(/CREATE TABLE "ops_events" \([\s\S]*?\n\);/)![0]);
  await pg.query('INSERT INTO mendel_transactions(transaction_id,transaction_date,user_name,merchant,total_amount,currency,budget,transaction_status,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)',[source.transactionId,source.transactionDate,source.userName,source.merchant,source.totalAmount,source.currency,source.budget,'CONFIRMADA']);
});
afterEach(async()=>{await pg.close();});
describe('manual Intra confirmations persisted on existing audit table, synthetic SQL only',()=>{
  it('starts unknown, not false or uploaded just because Mendel says confirmed',async()=>{
    expect(await read()).toMatchObject({uploaded:null,downloaded:null,eventId:null,version:0,needsReview:false});
    expect((await purchaseIntraStates(db,admin,[source])).get(source.transactionId)?.sourceHash).toBe(intraSourceHash(source));
  });
  it.each([[true,false],[false,true],[true,true],[false,false]] as const)('keeps uploaded=%s and downloaded=%s independent',async(uploaded,downloaded)=>{
    await transaction(await input({uploaded,downloaded}));expect(await read()).toMatchObject({uploaded,downloaded});
    expect(await db.query('SELECT transaction_status,reconciliation_status FROM mendel_transactions')).toEqual([{transaction_status:'CONFIRMADA',reconciliation_status:'PENDING'}]);
  });
  it('is shared across real authenticated admins and preserves every correction with author/date/before/after',async()=>{
    await transaction(await input({uploaded:true,downloaded:false}));await transaction(await input({uploaded:false,downloaded:true}),other);
    const result=await intraOverview(db,other,source.transactionId);
    expect(result.state).toMatchObject({uploaded:false,downloaded:true,version:2,updatedBy:other.name});
    expect(result.history).toHaveLength(2);expect(result.history[0]).toMatchObject({actor:other.name,before:{uploaded:true,downloaded:false},uploaded:false,downloaded:true});
    expect(result.history.every(h=>Number.isFinite(Date.parse(h.recordedAt)))).toBe(true);
    await transaction(await input({uploaded:null,downloaded:null}));expect((await intraOverview(db,admin,source.transactionId)).history).toHaveLength(3);
  });
  it('does not let a coordinator, technician or inactive user read/write the global purchase control',async()=>{
    for(const user of [{...admin,role:'COORDINATOR'},{...admin,role:'TECHNICIAN'},{...admin,active:false}] as User[]){
      await expect(purchaseIntraStates(db,user,[source])).rejects.toMatchObject({code:'FORBIDDEN'});
      await expect(transaction(await input(),user)).rejects.toMatchObject({code:'FORBIDDEN'});
    }
    expect(await db.query('SELECT id FROM ops_events')).toHaveLength(0);
  });
  it('is idempotent after an uncertain network result but rejects altered payload or actor with the same key',async()=>{
    const value=await input();await transaction(value);expect(await transaction(value)).toMatchObject({alreadySaved:true});
    await expect(transaction({...value,downloaded:true})).rejects.toMatchObject({code:'REQUEST_KEY_REUSED'});
    await expect(transaction(value,other)).rejects.toMatchObject({code:'REQUEST_KEY_REUSED'});
    expect(await db.query('SELECT id FROM ops_events')).toHaveLength(1);
  });
  it('rejects an obsolete expected version instead of overwriting another admin',async()=>{
    const stale=await input();await transaction(await input({downloaded:true}));
    await expect(transaction(stale)).rejects.toMatchObject({code:'INTRA_STATE_CHANGED'});
    expect((await read()).downloaded).toBe(true);
  });
  it('preserves manual confirmations on repeated CSV updates and requests review only for changed purchase facts',async()=>{
    await transaction(await input({uploaded:true,downloaded:true}));
    await pg.query("UPDATE mendel_transactions SET has_receipt=true,receipt_status='Presentado',updated_at=CURRENT_TIMESTAMP WHERE transaction_id=$1",[source.transactionId]);
    expect(await read()).toMatchObject({uploaded:true,downloaded:true,needsReview:false});
    await pg.query('UPDATE mendel_transactions SET total_amount=30000,updated_at=CURRENT_TIMESTAMP WHERE transaction_id=$1',[source.transactionId]);
    expect(await read()).toMatchObject({uploaded:true,downloaded:true,needsReview:true});
    await transaction(await input({uploaded:true,downloaded:true}));expect(await read()).toMatchObject({needsReview:false,version:2});
    expect((await intraOverview(db,admin,source.transactionId)).history).toHaveLength(2);
  });
  it('detects a purchase changing between display and confirmation',async()=>{
    const stale=await input();await pg.query('UPDATE mendel_transactions SET merchant=$1 WHERE transaction_id=$2',['Otro comercio sintético',source.transactionId]);
    await expect(transaction(stale)).rejects.toMatchObject({code:'MENDEL_PURCHASE_CHANGED'});expect(await db.query('SELECT id FROM ops_events')).toHaveLength(0);
  });
  it('canonicalizes money without floating-point loss or spurious CSV changes',()=>{
    expect(intraSourceHash({...source,totalAmount:'25000'})).toBe(intraSourceHash(source));
    expect(intraSourceHash({...source,totalAmount:'9999999999999999.90'})).toBe(intraSourceHash({...source,totalAmount:'9999999999999999.9'}));
    expect(intraSourceHash({...source,totalAmount:'9999999999999999.91'})).not.toBe(intraSourceHash({...source,totalAmount:'9999999999999999.90'}));
  });
  it('does not turn an unchanged untouched record into a confirmed no',async()=>{
    expect(await transaction(await input({uploaded:null,downloaded:null}))).toMatchObject({unchanged:true});expect(await db.query('SELECT id FROM ops_events')).toHaveLength(0);
  });
  it('rejects missing IDs and treats SQL fragments as bound strings, never SQL',async()=>{
    const value=await input({transactionId:"X'; DROP TABLE mendel_transactions; --"});await expect(transaction(value)).rejects.toMatchObject({code:'NOT_FOUND'});
    expect(await db.query('SELECT transaction_id FROM mendel_transactions')).toHaveLength(1);expect(await db.query('SELECT id FROM ops_events')).toHaveLength(0);
  });
  it('does not reuse the ID of another application audit event',async()=>{
    const value=await input();await pg.query("INSERT INTO ops_events(id,resource_key,action,actor_id,detail) VALUES($1,'another-resource','ANOTHER_ACTION',$2,'{}')",[value.requestId,admin.id]);
    await expect(transaction(value)).rejects.toMatchObject({code:'REQUEST_KEY_REUSED'});expect((await read()).version).toBe(0);
  });
  it('rolls back the whole confirmation if the transaction cannot commit',async()=>{
    const value=await input();await expect(pg.transaction(async tx=>{await confirmIntra({query:async<T>(s:string,p:unknown[]=[]) => (await tx.query<T>(s,p)).rows},admin,value);throw Error('synthetic commit failure');})).rejects.toThrow('synthetic commit failure');
    expect((await read()).version).toBe(0);expect(await db.query('SELECT id FROM ops_events')).toHaveLength(0);
  });
  it('uses explicit sequence version, not UUID/timestamp ordering, to resolve the current confirmation',async()=>{
    await transaction(await input({uploaded:true,downloaded:false}));await transaction(await input({uploaded:true,downloaded:true}));
    await pg.query("UPDATE ops_events SET created_at='2026-10-15T11:00:00Z'");expect(await read()).toMatchObject({version:2,downloaded:true});
  });
  it('strictly validates nullable booleans, opaque revision and source fingerprint and rejects a supplied actor',async()=>{
    const value=await input();expect(mendelIntraInput.safeParse(value).success).toBe(true);
    for(const v of [{...value,uploaded:'true'},{...value,actorId:admin.id},{...value,sourceHash:'fake'},{...value,expectedEventId:1},{...value,transactionId:''}])expect(mendelIntraInput.safeParse(v).success).toBe(false);
  });
});
