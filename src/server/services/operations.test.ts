import { beforeEach,describe,it,expect,vi } from 'vitest';
import { UserRole } from '@/contracts';
import type { OperationsActor,ReviewInput,VisitInput } from './operations';
const fake=vi.hoisted(()=>({db:{} as Record<string,unknown>,reviews:[] as unknown[],closed:false,updateCount:1}));
vi.mock('@/server/prisma',()=>({getPrismaClient:()=>fake.db}));
vi.mock('./operational-data',()=>({getPendingBySites:async()=>({})}));
import { addVisit,catalog,closeDay,deleteReview,materials,openForm,operationsActor,saveReview,updateVisit,yearlyMaintenance } from './operations';
const user={id:'00000000-0000-4000-8000-000000000001',name:'Test',email:'test@example.invalid',role:UserRole.COORDINATOR,active:true,technicianId:null,coordinatorId:null};
const non='NON - mantenimiento',bam='BAM - mantenimiento';
const actor:OperationsActor={user,allowed:[non]};
const source=(formulario:string)=>({formulario,grupo:'[#1] Insumo',indice:'1.24A',descripcion:'Cable',cantidad:{toString:()=> '2'},codigo_sitio:'ST1',nombre_sitio:'Sitio',imagen:null,sincronizado_el:new Date('2026-10-04')});
const visit:VisitInput={requestKey:'00000000-0000-4000-8000-000000000002',day:'2026-10-04',project:non,siteCode:'ST1',siteName:'Sitio',taskType:'PREVENTIVO',taskCode:'FO-26-1',technicians:['Test'],status:'PLANIFICADO',outcome:''};
let query:ReturnType<typeof vi.fn>,execute:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 fake.reviews=[];fake.closed=false;fake.updateCount=1;
 query=vi.fn(async(strings:TemplateStringsArray)=>{const sql=strings.join('?');if(sql.includes('ops_supply_reviews'))return fake.reviews;if(sql.includes('ops_days')&&fake.closed)return [{day:new Date('2026-10-04')}];return [];});
 execute=vi.fn(async(strings:TemplateStringsArray)=>strings.join('?').startsWith('UPDATE')?fake.updateCount:1);
 fake.db={
  $queryRaw:query,$executeRaw:execute,$transaction:async(run:(tx:unknown)=>unknown)=>run(fake.db),
  sytex_supply_form_contexts:{findMany:async()=>[]},sytex_site_maintenance:{findMany:async()=>[]},sytex_form_states:{findMany:async()=>[]},sytex_form_links:{findMany:async()=>[]},
  preventivos:{findMany:async()=>['NON','BAM'].map((p,i)=>({codigo:'FO-26-'+(i+1),proyecto:p+' - mantenimiento',codigos_sitios_afectados:'ST1',nombres_sitios_afectados:'Sitio',nombre:'Mantenimiento',asignado_a:'Test',usuario_colaborador:null}))},
  correctivos:{findMany:async()=>[]},cotizaciones:{findMany:async()=>[{proyecto:'CEF - Compras'},{proyecto:'NON - Generadores'}]},insumos:{findMany:async()=>[source('FO-26-1'),source('FO-26-2')]},sytex_supply_import_items:{findMany:async()=>[]},
 };
});
async function review():Promise<ReviewInput>{const row=(await materials(actor))[0];return {key:row.key,project:non,classification:'INCLUIDO',intraStatus:'DESCARGADO',invoiceNumber:'',countedQuantity:'2',intraQuantity:'2',notes:'',version:0,sourceHash:row.hash};}
describe('coordinator operation safeguards',()=>{
 it('lists real complete projects from Sytex without fixed zone seeds',async()=>{const c=await catalog({...actor,allowed:null});expect(c.projects).toEqual([bam,'CEF - Compras','NON - Generadores',non]);expect(c.projects).not.toContain('BAS');expect(c.projects).not.toContain('NON');});
 it('drops obsolete favorites without turning their selection into all projects',async()=>{query.mockImplementation(async(strings:TemplateStringsArray)=>strings.join('?').includes('ops_preferences')?[{favorites:[{name:'Viejo',projects:['NON']},{name:'Válido',projects:[non]}]}]:[]);expect((await catalog(actor)).favorites).toEqual([{name:'Válido',projects:[non]}]);});
 it('lets a coordinator without assigned projects work on every zone, without admin rights',async()=>{const shared=await operationsActor(user);expect(shared.allowed).toBeNull();expect((await catalog(shared)).admin).toBe(false);});
 it('keeps a coordinator with assigned projects limited to them',async()=>{query.mockImplementation(async(strings:TemplateStringsArray)=>strings.join('?').includes('ops_user_access')?[{projects:[non]}]:[]);expect((await operationsActor(user)).allowed).toEqual([non]);});
 it('exposes only material from assigned projects',async()=>{const rows=await materials(actor);expect(rows).toHaveLength(1);expect(rows[0].formulario).toBe('FO-26-1');});
 it('does not share supplies between projects that start with the same zone code',async()=>{expect(await materials({...actor,allowed:['NON - Generadores']})).toEqual([]);});
 it('rejects filters outside account permissions',async()=>{await expect(materials(actor,[bam])).rejects.toThrow('FORBIDDEN_PROJECT');});
 it('does not confirm an incomplete Intra count',async()=>{await expect(saveReview(actor,{...await review(),intraQuantity:'1'})).rejects.toThrow('QUANTITIES_DO_NOT_MATCH');expect(execute).not.toHaveBeenCalled();});
 it('does not decide inclusion without evidence',async()=>{await expect(saveReview(actor,{...await review(),classification:'PENDIENTE'})).rejects.toThrow('CLASSIFICATION_REQUIRED');});
 it('requires an invoice number for non-included downloaded supplies',async()=>{await expect(saveReview(actor,{...await review(),classification:'NO_INCLUIDO'})).rejects.toThrow('INVOICE_NUMBER_REQUIRED');});
 it('rejects changed source snapshots',async()=>{await expect(saveReview(actor,{...await review(),sourceHash:'wrong'})).rejects.toThrow('SOURCE_CHANGED');});
 it('rejects stale review writes',async()=>{fake.updateCount=0;await expect(saveReview(actor,await review())).rejects.toThrow('STALE_VERSION');});
 it('saves a balanced classified review with an audit event',async()=>{expect(await saveReview(actor,await review())).toEqual({saved:true});expect(execute.mock.calls.some(([strings])=>strings.join('?').includes('ops_events'))).toBe(true);});
 it('cannot add sites to another project or a closed day',async()=>{await expect(addVisit(actor,{...visit,project:bam})).rejects.toThrow('FORBIDDEN_PROJECT');fake.closed=true;await expect(addVisit(actor,visit)).rejects.toThrow('DAY_CLOSED');});
 it('does not link a task to a different site',async()=>{await expect(addVisit(actor,{...visit,siteCode:'ST2'})).rejects.toThrow('TASK_SITE_MISMATCH');});
 it('cannot close a day without visits',async()=>{await expect(closeDay(actor,'2026-10-04',[])).rejects.toThrow('NO_OPEN_DAY_WITH_VISITS');});
 it('does not update an inaccessible visit',async()=>{query.mockImplementation(async(strings:TemplateStringsArray)=>strings.join('?').includes('ops_visits')?[{project:bam}]:[]);await expect(updateVisit(actor,{id:visit.requestKey,version:0,technicians:['Test'],status:'REALIZADO',outcome:''})).rejects.toThrow('FORBIDDEN_PROJECT');});
 it('counts one year from the most recently reported service or filter change',()=>{const facts=[{kind:'SERVICE_GE',lastDate:new Date('2025-03-10'),formCode:'FO-26-1',reportedAt:'2026-09-01T10:00:00'},{kind:'SERVICE_GE',lastDate:new Date('2026-09-20'),formCode:'FO-26-2',reportedAt:'2026-09-20T10:00:00'},{kind:'FILTROS_AA',lastDate:new Date('2025-10-01'),formCode:'FO-26-3',reportedAt:'2026-09-02T10:00:00'}];
  expect(yearlyMaintenance(facts,new Date('2026-10-05'))).toEqual([{kind:'SERVICE_GE',lastDate:'2026-09-20',dueDate:'2027-09-20',due:false,formCode:'FO-26-2'},{kind:'FILTROS_AA',lastDate:'2025-10-01',dueDate:'2026-10-01',due:true,formCode:'FO-26-3'}]);});
});

describe('forms offered when a site is typed',()=>{
 const now=new Date('2026-10-05T15:00:00Z');
 it('keeps only preventives planned this month and correctives not yet done',()=>{
  expect(openForm({type:'PREVENTIVO',status:'Open',planDate:'2026-10-20'},now)).toBe(true);
  expect(openForm({type:'PREVENTIVO',status:'Open',planDate:'2026-09-20'},now)).toBe(false);
  expect(openForm({type:'PREVENTIVO',status:'Open',planDate:null},now)).toBe(true);
  expect(openForm({type:'CORRECTIVO',status:'In progress',planDate:'2026-07-01'},now)).toBe(true);
  expect(openForm({type:'CORRECTIVO',status:'Rejected'},now)).toBe(true);
  expect(openForm({type:'CORRECTIVO',status:'Approved'},now)).toBe(false);
  expect(openForm({type:'PREVENTIVO',status:'Aprobado',planDate:'2026-10-02'},now)).toBe(false);
  expect(openForm({type:'CORRECTIVO',status:'Cancelled'},now)).toBe(false);
  expect(openForm({type:'OTRO',status:'Open'},now)).toBe(false);
 });
 it('uses the Argentina month at the turn of the month',()=>{
  expect(openForm({type:'PREVENTIVO',status:'Open',planDate:'2026-09-15'},new Date('2026-10-01T01:00:00Z'))).toBe(true);
 });
});

describe('deleting a saved control',()=>{
 const saved=(key:string,version=3)=>[{source_key:key,project:non,classification:'INCLUIDO',intra_status:'DESCARGADO',invoice_number:'0022-1',counted_quantity:null,intra_quantity:null,notes:'',source_hash:'h',version,updated_at:new Date(),updated_by:'u'}];
 it('removes the control and its receipts and leaves a trace',async()=>{
  const key=(await materials(actor))[0].key;fake.reviews=saved(key);
  expect(await deleteReview(actor,{key,version:3})).toEqual({deleted:true});
  const sql=execute.mock.calls.map(call=>(call[0] as TemplateStringsArray).join('?'));
  expect(sql.some(s=>s.includes('DELETE FROM ops_review_files'))).toBe(true);
  expect(sql.some(s=>s.includes('DELETE FROM ops_supply_reviews'))).toBe(true);
  expect(sql.some(s=>s.includes('INTRA_REVIEW_DELETED')||s.includes('ops_events'))).toBe(true);
 });
 it('refuses when the control changed meanwhile or does not exist',async()=>{
  const key=(await materials(actor))[0].key;fake.reviews=saved(key);
  execute.mockImplementation(async(strings:TemplateStringsArray)=>strings.join('?').includes('DELETE FROM ops_supply_reviews')?0:1);
  await expect(deleteReview(actor,{key,version:2})).rejects.toThrow('STALE_VERSION');
  fake.reviews=[];await expect(deleteReview(actor,{key,version:3})).rejects.toThrow('NOT_FOUND');
 });
});
