import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),transaction:vi.fn(),confirm:vi.fn(),overview:vi.fn()}));
vi.mock('@/server/services/auth-sessions',()=>({requireAdminSession:m.auth}));
vi.mock('@/server/prisma',()=>({getPrismaClient:()=>({$transaction:m.transaction})}));
vi.mock('@/server/services/mendel-intra-control',async original=>({...await original<typeof import('@/server/services/mendel-intra-control')>(),confirmIntra:m.confirm,intraOverview:m.overview}));
import {GET,POST} from './route';
const url='http://localhost:3001/api/mendel/intra-control';
const body={transactionId:'SYNTHETIC-001',uploaded:true,downloaded:false,expectedEventId:null,sourceHash:'a'.repeat(64),requestId:'00000000-0000-4000-8000-000000000001'};
const request=(data:unknown=body,origin='http://localhost:3001')=>new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)});
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({ok:true,user:{id:'admin',role:'ADMIN',active:true}});m.transaction.mockImplementation(async run=>run({$queryRawUnsafe:vi.fn()}));m.confirm.mockResolvedValue({state:{uploaded:true,downloaded:false}});m.overview.mockResolvedValue({history:[]});});
describe('Mendel Intra HTTP authentication, validation and write boundary',()=>{
  it('never reads or writes without a session or Admin permission',async()=>{for(const status of [401,403]){m.auth.mockResolvedValue({ok:false,response:Response.json({code:'DENIED'},{status})});expect((await GET(new Request(url+'?transactionId=SYNTHETIC-001'))).status).toBe(status);expect((await POST(request())).status).toBe(status);}expect(m.transaction).not.toHaveBeenCalled();});
  it('rejects cross-site writes before any transaction',async()=>{expect((await POST(request(body,'https://foreign.invalid'))).status).toBe(403);expect(m.transaction).not.toHaveBeenCalled();});
  it('rejects forged actors, string booleans and missing expected source before writes',async()=>{for(const data of [{...body,actorId:'forged'},{...body,uploaded:'true'},{...body,sourceHash:undefined}])expect((await POST(request(data))).status).toBe(422);expect(m.transaction).not.toHaveBeenCalled();});
  it('enforces the streamed body limit even if content-length is absent',async()=>{const req=new Request(url,{method:'POST',headers:{origin:'http://localhost:3001','content-type':'application/json'},body:'x'.repeat(65537)});expect((await POST(req)).status).toBe(413);expect(m.transaction).not.toHaveBeenCalled();});
  it('writes through one transaction and does not accept an actor from the browser',async()=>{const r=await POST(request());expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(m.transaction).toHaveBeenCalledTimes(1);expect(m.confirm).toHaveBeenCalledWith(expect.anything(),{id:'admin',role:'ADMIN',active:true},body);});
  it('reads history privately after validating the exact purchase ID',async()=>{expect((await GET(new Request(url+'?transactionId=SYNTHETIC-001'))).status).toBe(200);expect(m.overview).toHaveBeenCalledWith(expect.anything(),expect.anything(),'SYNTHETIC-001');expect((await GET(new Request(url))).status).toBe(422);});
});
