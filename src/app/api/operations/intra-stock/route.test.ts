import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({session:vi.fn(),state:vi.fn(),history:vi.fn(),sites:vi.fn(),materials:vi.fn(),save:vi.fn(),change:vi.fn()}));
vi.mock('@/server/operations-http',()=>({requireOperationsSession:mock.session}));
vi.mock('@/server/services/operations',async original=>({...await original<typeof import('@/server/services/operations')>(),materials:mock.materials}));
vi.mock('@/server/services/site-control',()=>({siteControl:mock.sites}));
vi.mock('@/server/services/intra-stock',async original=>({...await original<typeof import('@/server/services/intra-stock')>(),intraState:mock.state,intraHistory:mock.history,saveIntraSnapshot:mock.save,changeIntraLink:mock.change}));
import { GET, POST } from './route';
import { operationalWorkbook } from '@/server/operations-xlsx';
const actor={user:{id:'admin',active:true,role:'ADMIN'},allowed:null};
const url='http://localhost/api/operations/intra-stock';
beforeEach(()=>{
 vi.clearAllMocks();mock.session.mockResolvedValue({ok:true,actor});mock.state.mockResolvedValue({version:0,records:[],scopes:[],allocations:[]});mock.sites.mockResolvedValue({fuel:[]});mock.materials.mockResolvedValue([]);mock.history.mockResolvedValue([]);
});
describe('Intra route authorization and safe upload boundary',()=>{
 it('preserves unauthenticated rejection before reading data',async()=>{
  mock.session.mockResolvedValue({ok:false,response:new Response(null,{status:401})});
  expect((await GET(new Request(url))).status).toBe(401);expect(mock.state).not.toHaveBeenCalled();
 });
 it('rejects coordination reads and writes on the server even with a global scope',async()=>{
  mock.session.mockResolvedValue({ok:true,actor:{...actor,user:{...actor.user,role:'COORDINATOR'}}});
  expect((await GET(new Request(url))).status).toBe(403);expect((await POST(new Request(url,{method:'POST'}))).status).toBe(403);expect(mock.state).not.toHaveBeenCalled();expect(mock.save).not.toHaveBeenCalled();
 });
 it('never caches financial snapshots and paginates authorized history',async()=>{
  const response=await GET(new Request(url+'?history=1&before=10'));expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(mock.history).toHaveBeenCalledWith(actor,10);
 });
 it('rejects cross-origin writes before parsing an upload or modifying any state',async()=>{
  const response=await POST(new Request(url+'?action=import',{method:'POST',headers:{origin:'https://other.example'},body:'not an excel'}));expect(response.status).toBe(403);expect(mock.save).not.toHaveBeenCalled();
 });
 it('previews a production-parser workbook without saving or writing anything',async()=>{
  const bytes=operationalWorkbook([{name:'Sheet1',rows:[['Insumos'],['Fecha','Factura','Proveedor','Reg-Zon-SZon','Producto','Disponible','Monto Neto','Liquidada']]}]);
  const response=await POST(new Request(url+'?action=preview',{method:'POST',body:Buffer.from(bytes)}));expect(response.status).toBe(200);expect(await response.json()).toEqual({rows:[]});expect(mock.save).not.toHaveBeenCalled();
 });
 it('rejects an oversized streamed upload even before metadata validation',async()=>{
  const response=await POST(new Request(url+'?action=import',{method:'POST',body:new Uint8Array(2*1024*1024+1)}));expect(response.status).toBe(413);expect(mock.save).not.toHaveBeenCalled();
 });
 it('requires an explicit complete snapshot declaration, not arbitrary client rows',async()=>{
  const response=await POST(new Request(url+'?action=import',{method:'POST',body:Buffer.from(operationalWorkbook([{name:'Sheet1',rows:[['Fecha','Factura','Proveedor','Reg-Zon-SZon','Producto','Disponible','Monto Neto','Liquidada']]}])),headers:{'x-intra-meta':encodeURIComponent(JSON.stringify({version:0,scopes:['MED - NON - Salta'],complete:false}))}}));expect(response.status).toBe(422);expect(mock.save).not.toHaveBeenCalled();
 });
});
