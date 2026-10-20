import {NextRequest} from 'next/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),find:vi.fn(),count:vi.fn(),group:vi.fn(),batch:vi.fn(),query:vi.fn()}));
vi.mock('@/server/services/auth-sessions',()=>({requireAdminSession:m.auth}));
vi.mock('@/server/prisma',()=>({getPrismaClient:()=>({mendel_transactions:{findMany:m.find,count:m.count,groupBy:m.group},mendel_import_batches:{findFirst:m.batch},$queryRawUnsafe:m.query})}));
import {GET} from './route';
const item={transactionId:'SYNTHETIC-001',transactionDate:new Date('2026-10-15T11:00:00Z'),userName:'Persona ficticia',merchant:'Comercio de prueba',totalAmount:'25000.00',currency:'ARS',budget:'TEST',reconciliationStatus:'PENDING'};
const url='http://localhost:3001/api/mendel/transactions';
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({ok:true,user:{id:'admin',role:'ADMIN',active:true}});m.find.mockResolvedValue([item]);m.count.mockResolvedValue(1);m.group.mockResolvedValue([{currency:'ARS',_sum:{totalAmount:'25000.00'}}]);m.batch.mockResolvedValue(null);m.query.mockResolvedValue([]);});
describe('purchase listing with manual Intra overlay',()=>{
  it('authenticates before touching purchases or confirmations',async()=>{m.auth.mockResolvedValue({ok:false,response:Response.json({code:'UNAUTHENTICATED'},{status:401})});expect((await GET(new NextRequest(url))).status).toBe(401);expect(m.find).not.toHaveBeenCalled();expect(m.query).not.toHaveBeenCalled();});
  it('returns independent unknown controls for the actual page without changing reconciliation or writing anything',async()=>{const r=await GET(new NextRequest(url+'?page=2'));expect(r.status).toBe(200);const body=await r.json();expect(body.items[0]).toMatchObject({transactionId:item.transactionId,reconciliationStatus:'PENDING',intra:{uploaded:null,downloaded:null,eventId:null}});expect(m.find.mock.calls[0][0]).toMatchObject({skip:50,take:50});expect(m.query.mock.calls[0][2]).toContain('mendel-intra:SYNTHETIC-001');expect(m.query.mock.calls.every(([sql])=>!/^\s*(INSERT|UPDATE|DELETE)/.test(sql))).toBe(true);});
  it('fails visibly on database failure rather than fabricating pending or negative confirmations',async()=>{m.query.mockRejectedValue(Error('synthetic database outage'));const r=await GET(new NextRequest(url));expect(r.status).toBe(503);expect(await r.json()).toEqual({code:'MENDEL_DATA_UNAVAILABLE'});});
});
