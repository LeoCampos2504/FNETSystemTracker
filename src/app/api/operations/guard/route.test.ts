import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),create:vi.fn(),replace:vi.fn(),overview:vi.fn()}));
vi.mock('@/server/operations-http',()=>({requireOperationsSession:m.session}));
vi.mock('@/server/services/guard-crews',()=>({addGuardCrew:m.create,replaceGuardCrew:m.replace}));
vi.mock('@/server/services/guard-duty',()=>({guardOverview:m.overview,addGuardPeriod:vi.fn(),updateGuardPeriod:vi.fn(),removeGuardPeriod:vi.fn(),addHoliday:vi.fn(),removeHoliday:vi.fn(),setVisitHours:vi.fn()}));
import {GET,POST} from './route';
const url='http://localhost:3001/api/operations/guard';
const body={action:'addCrew',requestKey:'00000000-0000-4000-8000-000000000001',zone:'NOA',technicians:['Técnico A','Técnico B'],startAt:'2026-10-14T08:00',endAt:'2026-10-21T08:00',legacyIds:[]};
const request=(value:unknown=body,origin='http://localhost:3001')=>new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(value)});
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({ok:true,actor:{user:{role:'ADMIN',id:'example'}}});m.create.mockResolvedValue({id:'example'});});
describe('guard crew HTTP boundary',()=>{
  it('does not read or write without a session',async()=>{m.session.mockResolvedValue({ok:false,response:Response.json({code:'UNAUTHENTICATED'},{status:401})});expect((await GET(new Request(url))).status).toBe(401);expect((await POST(request())).status).toBe(401);expect(m.overview).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();});
  it('preserves CTIC write denial from the server session guard',async()=>{m.session.mockResolvedValue({ok:false,response:Response.json({code:'FORBIDDEN'},{status:403})});expect((await POST(request())).status).toBe(403);expect(m.create).not.toHaveBeenCalled();expect(m.session).toHaveBeenCalledWith();});
  it('rejects cross-site requests without writing',async()=>{expect((await POST(request(body,'https://foreign.invalid'))).status).toBe(403);expect(m.create).not.toHaveBeenCalled();});
  it('rejects forged actor/version fields and invalid pair sizes before calling the service',async()=>{for(const value of [{...body,actorId:'forged'},{...body,technicians:['Técnico A']},{...body,technicians:['A','B','C']},{...body,startAt:'14/10/2026'}])expect((await POST(request(value))).status).toBe(422);expect(m.create).not.toHaveBeenCalled();});
  it('delegates a valid crew to the transactional service and marks the response private',async()=>{const response=await POST(request());expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(m.create).toHaveBeenCalledWith(expect.objectContaining({user:expect.anything()}),body);});
  it('bounds streamed input independently of content-length',async()=>{const r=new Request(url,{method:'POST',headers:{origin:'http://localhost:3001','content-type':'application/json'},body:'x'.repeat(65537)});expect((await POST(r)).status).toBe(413);expect(m.create).not.toHaveBeenCalled();});
});
