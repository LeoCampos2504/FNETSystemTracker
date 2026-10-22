import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),saveReviews:vi.fn()}));
vi.mock('@/server/operations-http',()=>({requireOperationsSession:mocks.session}));
vi.mock('@/server/services/operations',()=>({saveReviews:mocks.saveReviews}));
import {POST} from './route';
const url='http://localhost:3001/api/operations';
const review={key:'EXAMPLE',project:'TEST',classification:'INCLUIDO',intraStatus:'DESCARGADO',invoiceNumber:'F',countedQuantity:'1',intraQuantity:'1',notes:'',version:0,sourceHash:'a'.repeat(64)};
const request=(body:unknown,origin='http://localhost:3001')=>new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({ok:true,actor:{user:{id:'test'}}});mocks.saveReviews.mockResolvedValue({saved:1});});
describe('bulk review HTTP boundary',()=>{
  it('requires a valid session before bulk writes',async()=>{mocks.session.mockResolvedValue({ok:false,response:Response.json({}, {status:401})});expect((await POST(request({action:'reviewBatch',reviews:[review]}))).status).toBe(401);expect(mocks.saveReviews).not.toHaveBeenCalled();});
  it('preserves role/CTIC denial and rejects cross-site writes',async()=>{mocks.session.mockResolvedValueOnce({ok:false,response:Response.json({}, {status:403})});expect((await POST(request({action:'reviewBatch',reviews:[review]}))).status).toBe(403);expect((await POST(request({action:'reviewBatch',reviews:[review]},'https://foreign.invalid'))).status).toBe(403);expect(mocks.saveReviews).not.toHaveBeenCalled();});
  it('validates the strict batch before dispatching and rejects an oversized body',async()=>{
    expect((await POST(request({action:'reviewBatch',reviews:[{...review,actorId:'spoof'}]}))).status).toBe(422);
    expect((await POST(request({action:'reviewBatch',reviews:[{...review,notes:'x'.repeat(65537)}]}))).status).toBe(413);
    expect(mocks.saveReviews).not.toHaveBeenCalled();
  });
  it('dispatches one validated request with the server actor',async()=>{expect((await POST(request({action:'reviewBatch',reviews:[review]}))).status).toBe(200);expect(mocks.saveReviews).toHaveBeenCalledTimes(1);expect(mocks.saveReviews).toHaveBeenCalledWith({user:{id:'test'}},[review]);});
});
