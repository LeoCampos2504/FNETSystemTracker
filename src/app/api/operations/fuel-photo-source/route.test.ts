import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),catalog:vi.fn(),inspect:vi.fn()}));
vi.mock('@/server/operations-http',()=>({requireOperationsSession:mocks.session}));
vi.mock('@/server/services/operations',()=>({catalog:mocks.catalog}));
vi.mock('@/server/services/fuel-photo-source',()=>({inspectFuelPhotoSource:mocks.inspect}));
import {GET} from './route';
const request=(query='form=FO-26-000001&index=9.2A.2')=>new Request('https://fnet.invalid/api/operations/fuel-photo-source?'+query);
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({ok:true,actor:{user:{id:'admin',active:true,role:'ADMIN'},allowed:null}});mocks.catalog.mockResolvedValue({tasks:[{code:'FO-26-000001'}]});mocks.inspect.mockResolvedValue({available:false,code:'SYTEX_PHOTO_ACCESS_DENIED'});});
describe('private fuel photo source access',()=>{
  it('requires a session',async()=>{mocks.session.mockResolvedValue({ok:false,response:Response.json({}, {status:401})});expect((await GET(request())).status).toBe(401);expect(mocks.inspect).not.toHaveBeenCalled();});
  it.each([{user:{active:true,role:'COORDINATOR'},allowed:null},{user:{active:true,role:'ADMIN'},allowed:['NON']},{user:{active:false,role:'ADMIN'},allowed:null}])('rejects unauthorized actors before calling Sytex',async(actor)=>{mocks.session.mockResolvedValue({ok:true,actor});expect((await GET(request())).status).toBe(403);expect(mocks.inspect).not.toHaveBeenCalled();});
  it('rejects unknown forms and invalid indexes',async()=>{expect((await GET(request('form=FO-26-000001&index=../../private'))).status).toBe(422);mocks.catalog.mockResolvedValue({tasks:[]});expect((await GET(request())).status).toBe(404);expect(mocks.inspect).not.toHaveBeenCalled();});
  it('returns only the sanitized result with no-store',async()=>{const response=await GET(request());expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toContain('no-store');expect(await response.json()).toEqual({available:false,code:'SYTEX_PHOTO_ACCESS_DENIED'});expect(mocks.inspect).toHaveBeenCalledWith('FO-26-000001','9.2A.2');});
});
