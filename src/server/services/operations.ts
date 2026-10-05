import { createHash,randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { User } from '@/contracts';
import type { Favorite, Material, MaterialReview, OperationsCatalog, SourceMaterial, Visit } from '@/contracts/operations';
import { allowedProject, materialAlert, mergeMaterials, projectKey, safeImage, selectProjects, sourceHash, sourceIdentity } from '@/server/operations-domain';
import { getPrismaClient } from '@/server/prisma';
import { getPendingBySites } from './operational-data';
import { SupplyError } from './supply-control';

export type OperationsActor={user:User;allowed:string[]|null};
type Db=Prisma.TransactionClient;
function fail(code:string,status=409):never{throw new SupplyError(code,status);}
export async function operationsActor(user:User):Promise<OperationsActor> {
  if(user.role==='ADMIN')return {user,allowed:null};
  if(user.role!=='COORDINATOR')fail('FORBIDDEN',403);
  const rows=await getPrismaClient().$queryRaw<{projects:string[]}[]>`SELECT projects FROM ops_user_access WHERE user_id=${user.id}::uuid`;
  if(!rows[0]?.projects.length)fail('PROJECT_ACCESS_REQUIRED',403);
  return {user,allowed:rows[0].projects};
}
type OfficialTask={codigo:string;proyecto:string|null;codigos_sitios_afectados:string|null;nombres_sitios_afectados:string|null;nombre:string|null;asignado_a:string|null;usuario_colaborador:string|null};
export async function catalog(actor:OperationsActor):Promise<OperationsCatalog> {
  const db=getPrismaClient();
  const [preventivos,correctivos,prefs]=await Promise.all([
    db.preventivos.findMany({select:{codigo:true,proyecto:true,codigos_sitios_afectados:true,nombres_sitios_afectados:true,nombre:true,asignado_a:true,usuario_colaborador:true}}),
    db.correctivos.findMany({select:{codigo:true,proyecto:true,codigos_sitios_afectados:true,nombres_sitios_afectados:true,nombre:true,asignado_a:true,usuario_colaborador:true}}),
    db.$queryRaw<{favorites:Favorite[]}[]>`SELECT favorites FROM ops_preferences WHERE user_id=${actor.user.id}::uuid`,
  ]);
  const map=(rows:OfficialTask[],type:string)=>rows.map(r=>({code:r.codigo,type,project:projectKey(r.proyecto),siteCode:r.codigos_sitios_afectados??'',siteName:r.nombres_sitios_afectados??'',description:r.nombre??'',technicians:[r.asignado_a,r.usuario_colaborador].filter((t):t is string=>!!t)}));
  const all=[...map(preventivos,'PREVENTIVO'),...map(correctivos,'CORRECTIVO')];
  const allProjects=[...new Set(['NON','CEF','BAS','BAM',...all.map(r=>r.project),...(actor.allowed??[])].filter(Boolean))].sort();
  const tasks=all.filter(t=>allowedProject(t.project,actor.allowed));
  return {projects:allProjects.filter(p=>allowedProject(p,actor.allowed)),allProjects,favorites:(prefs[0]?.favorites??[]).map(f=>({...f,projects:f.projects.filter(p=>allowedProject(p,actor.allowed))})),admin:actor.allowed===null,tasks,technicians:[...new Set(tasks.flatMap(t=>t.technicians))].sort()};
}
export async function saveFavorite(actor:OperationsActor,favorite:Favorite) {
  const c=await catalog(actor); selectProjects(favorite.projects,c.projects);
  const db=getPrismaClient();
  await db.$transaction(async tx=>{
    await tx.$executeRaw`INSERT INTO ops_preferences(user_id) VALUES (${actor.user.id}::uuid) ON CONFLICT DO NOTHING`;
    const [current]=await tx.$queryRaw<{favorites:Favorite[]}[]>`SELECT favorites FROM ops_preferences WHERE user_id=${actor.user.id}::uuid FOR UPDATE`;
    const favorites=[...current.favorites.filter(f=>f.name!==favorite.name),favorite].slice(-12);
    await tx.$executeRaw`UPDATE ops_preferences SET favorites=${JSON.stringify(favorites)}::jsonb,updated_at=CURRENT_TIMESTAMP WHERE user_id=${actor.user.id}::uuid`;
  });
  return {saved:true};
}
export async function audit(tx:Db,actor:OperationsActor,key:string,action:string,detail:unknown){await tx.$executeRaw`INSERT INTO ops_events(id,resource_key,action,actor_id,detail) VALUES (${randomUUID()}::uuid,${key},${action},${actor.user.id}::uuid,${JSON.stringify(detail)}::jsonb)`;}
const assertProject=(actor:OperationsActor,project:string)=>{if(!allowedProject(project,actor.allowed))fail('FORBIDDEN_PROJECT',403);};
export type VisitInput={requestKey:string;day:string;project:string;siteCode:string;siteName:string;taskType:string;taskCode:string;technicians:string[];status:Visit['status'];outcome:string};
type VisitRow={id:string;day:Date;project:string;site_code:string;site_name:string;task_type:string;task_code:string;technicians:string[];status:Visit['status'];outcome:string;version:number;updated_at:Date};
function mapVisit(r:VisitRow):Visit{return {id:r.id,day:r.day.toISOString().slice(0,10),project:r.project,siteCode:r.site_code,siteName:r.site_name,taskType:r.task_type,taskCode:r.task_code,technicians:r.technicians,status:r.status,outcome:r.outcome,version:r.version,updatedAt:r.updated_at.toISOString(),pending:[],closed:false};}
async function lockDay(tx:Db,day:string,project:string){await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${day+'|'+project}))) AS lock`;
  const closed=await tx.$queryRaw<unknown[]>`SELECT day FROM ops_days WHERE day=${day}::date AND project=${project}`; if(closed.length)fail('DAY_CLOSED');}
export async function addVisit(actor:OperationsActor,input:VisitInput){
  const c=await catalog(actor); if(!c.projects.includes(input.project))fail('FORBIDDEN_PROJECT',403);
  const matched=input.taskCode?c.tasks.find(t=>t.code===input.taskCode&&t.type===input.taskType&&t.project===input.project):null;
  if(input.taskCode&&!matched)fail('TASK_NOT_IN_PROJECT',422);
  if(matched?.siteCode&&matched.siteCode!==input.siteCode)fail('TASK_SITE_MISMATCH',422);
  if(new Set(input.technicians.map(t=>t.toLowerCase())).size!==input.technicians.length)fail('DUPLICATE_TECHNICIANS',422);
  return getPrismaClient().$transaction(async tx=>{
    await lockDay(tx,input.day,input.project);
    const requestHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const [previous]=await tx.$queryRaw<{id:string;created_by:string;request_hash:string}[]>`SELECT id,created_by,request_hash FROM ops_visits WHERE request_key=${input.requestKey}::uuid`;
    if(previous){if(previous.created_by!==actor.user.id||previous.request_hash!==requestHash)fail('REQUEST_KEY_REUSED');return {id:previous.id,alreadySaved:true};}
    const id=randomUUID();
    await tx.$executeRaw`INSERT INTO ops_visits(id,request_key,request_hash,day,project,site_code,site_name,task_type,task_code,technicians,status,outcome,created_by,updated_by) VALUES (${id}::uuid,${input.requestKey}::uuid,${requestHash},${input.day}::date,${input.project},${input.siteCode},${input.siteName},${input.taskType},${input.taskCode},${JSON.stringify(input.technicians)}::jsonb,${input.status},${input.outcome},${actor.user.id}::uuid,${actor.user.id}::uuid)`;
    await audit(tx,actor,id,'VISIT_CREATED',input);return {id};
  });
}
export async function updateVisit(actor:OperationsActor,input:{id:string;version:number;technicians:string[];status:Visit['status'];outcome:string}){
  if(new Set(input.technicians.map(t=>t.toLowerCase())).size!==input.technicians.length)fail('DUPLICATE_TECHNICIANS',422);
  return getPrismaClient().$transaction(async tx=>{
    const [row]=await tx.$queryRaw<VisitRow[]>`SELECT * FROM ops_visits WHERE id=${input.id}::uuid`;if(!row)fail('NOT_FOUND',404);assertProject(actor,row.project);
    await lockDay(tx,row.day.toISOString().slice(0,10),row.project);
    const updated=await tx.$executeRaw`UPDATE ops_visits SET technicians=${JSON.stringify(input.technicians)}::jsonb,status=${input.status},outcome=${input.outcome},updated_by=${actor.user.id}::uuid,updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE id=${input.id}::uuid AND version=${input.version}`;
    if(!updated)fail('STALE_VERSION');await audit(tx,actor,input.id,'VISIT_UPDATED',input);return {saved:true};
  });
}
export async function visits(actor:OperationsActor,day:string,requested:string[]){
  const c=await catalog(actor),projects=selectProjects(requested,c.projects),db=getPrismaClient();
  const [rows,days]=await Promise.all([
    db.$queryRaw<VisitRow[]>`SELECT * FROM ops_visits WHERE day=${day}::date AND project IN (SELECT jsonb_array_elements_text(${JSON.stringify(projects)}::jsonb)) ORDER BY project,site_code,updated_at`,
    db.$queryRaw<{project:string;closed_at:Date;snapshot:Visit[]}[]>`SELECT project,closed_at,snapshot FROM ops_days WHERE day=${day}::date AND project IN (SELECT jsonb_array_elements_text(${JSON.stringify(projects)}::jsonb))`,
  ]);
  const closed=new Map(days.map(d=>[d.project,d]));
  const live=rows.filter(r=>!closed.has(r.project)).map(mapVisit);
  const pending=await getPendingBySites(live.map(r=>r.siteCode));
  // Site-only links are exposed only when their source form belongs to the same project.
  const taskProjects=new Map(c.tasks.map(t=>[t.code,t.project]));
  for(const v of live)v.pending=(pending[v.siteCode]??[]).filter(p=>taskProjects.get(p.formulario)===v.project).map(p=>[p.formulario,p.question,p.answer,p.comments].filter(Boolean).join(' · '));
  return {items:[...live,...days.flatMap(d=>d.snapshot.map(v=>({...v,closed:true})))],projects,closed:days.map(d=>({project:d.project,closedAt:d.closed_at.toISOString()}))};
}
export async function closeDay(actor:OperationsActor,day:string,requested:string[]){
  const result=await visits(actor,day,requested);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(day>today)fail('FUTURE_DAY_CANNOT_CLOSE',422);
  const projects=result.projects.filter(p=>result.items.some(v=>v.project===p)&&!result.closed.some(d=>d.project===p)).sort();
  if(!projects.length)fail('NO_OPEN_DAY_WITH_VISITS',422);
  if(result.items.some(v=>projects.includes(v.project)&&['PLANIFICADO','EN_CURSO'].includes(v.status)))fail('UNFINISHED_VISITS',422);
  return getPrismaClient().$transaction(async tx=>{
    for(const project of projects){await lockDay(tx,day,project);
      const current=await tx.$queryRaw<VisitRow[]>`SELECT * FROM ops_visits WHERE day=${day}::date AND project=${project} ORDER BY site_code,updated_at`;
      const snapshot=current.map(r=>{const previous=result.items.find(v=>v.id===r.id);if(!previous||previous.version!==r.version)fail('STALE_VERSION');return {...mapVisit(r),pending:previous.pending,closed:true};});
      if(snapshot.some(v=>['PLANIFICADO','EN_CURSO'].includes(v.status)))fail('UNFINISHED_VISITS',422);
      await tx.$executeRaw`INSERT INTO ops_days(day,project,closed_by,snapshot) VALUES (${day}::date,${project},${actor.user.id}::uuid,${JSON.stringify(snapshot)}::jsonb)`;
      await audit(tx,actor,day+'|'+project,'DAY_CLOSED',{visits:snapshot.length});
    }return {saved:true,projects};
  });
}

export async function history(actor:OperationsActor,requested:string[]){
 const c=await catalog(actor),projects=selectProjects(requested,c.projects);
 const rows=await getPrismaClient().$queryRaw<{day:Date;project:string;closed_at:Date}[]>`SELECT day,project,closed_at FROM ops_days WHERE project IN (SELECT jsonb_array_elements_text(${JSON.stringify(projects)}::jsonb)) ORDER BY day DESC,project LIMIT 90`;
 return rows.map(r=>({day:r.day.toISOString().slice(0,10),project:r.project,closedAt:r.closed_at.toISOString()}));
}
type ReviewRow={source_key:string;project:string;classification:string;intra_status:string;invoice_number:string;counted_quantity:Prisma.Decimal|null;intra_quantity:Prisma.Decimal|null;notes:string;source_hash:string;version:number;updated_at:Date;updated_by:string};
const reviewContract=(r:ReviewRow):MaterialReview=>({project:r.project,classification:r.classification,intraStatus:r.intra_status,invoiceNumber:r.invoice_number,countedQuantity:r.counted_quantity?.toString()??null,intraQuantity:r.intra_quantity?.toString()??null,notes:r.notes,sourceHash:r.source_hash,version:r.version,updatedAt:r.updated_at.toISOString(),updatedBy:r.updated_by});
export async function materials(actor:OperationsActor,requested:string[]=[]):Promise<Material[]>{
  const db=getPrismaClient(),c=await catalog(actor),projects=selectProjects(requested,c.projects),global=actor.allowed===null?c:await catalog({...actor,allowed:null});
  const [official,exported,reviews,files]=await Promise.all([
    db.insumos.findMany({orderBy:{sincronizado_el:'desc'}}),
    db.sytex_supply_import_items.findMany({include:{import:{select:{importedAt:true}}}}),
    db.$queryRaw<ReviewRow[]>`SELECT * FROM ops_supply_reviews`,
    db.$queryRaw<{id:string;source_key:string;file_name:string;mime_type:string}[]>`SELECT id,source_key,file_name,mime_type FROM ops_review_files`,
  ]);
  const projectByForm=new Map<string,Set<string>>();for(const t of global.tasks){const set=projectByForm.get(t.code)??new Set<string>();set.add(t.project);projectByForm.set(t.code,set);}
  const make=(r:{formulario:string;group:string|null;index:string|null;description:string|null;quantity:string|null;siteCode:string|null;siteName:string|null;image:string|null;imageDeclared:boolean;technician:string;source:string;syncedAt:string}):SourceMaterial=>{const value={key:sourceIdentity(r.formulario,r.group,r.index),formulario:r.formulario,group:r.group??'',index:r.index??'',description:r.description??'',quantity:r.quantity,siteCode:r.siteCode??'',siteName:r.siteName??'',technician:r.technician,image:safeImage(r.image),imageDeclared:r.imageDeclared,projects:[...(projectByForm.get(r.formulario)??[])],source:r.source,syncedAt:r.syncedAt};return {...value,hash:sourceHash(value)};};
  const taskByCode=new Map(c.tasks.map(t=>[t.code,t]));
  const all=mergeMaterials([
    ...official.map(r=>make({formulario:r.formulario,group:r.grupo,index:r.indice,description:r.descripcion,quantity:r.cantidad?.toString()??null,siteCode:r.codigo_sitio,siteName:r.nombre_sitio,image:r.imagen,imageDeclared:!!r.imagen,technician:taskByCode.get(r.formulario)?.technicians.join(' / ')??'',source:'Sytex · n8n',syncedAt:r.sincronizado_el.toISOString()})),
    ...exported.map(r=>make({formulario:r.formulario,group:r.grupo,index:r.indice,description:r.description,quantity:r.quantity?.toString()??null,siteCode:r.siteCode,siteName:r.siteName,image:r.image,imageDeclared:r.imageDeclared,technician:taskByCode.get(r.formulario)?.technicians.join(' / ')??'',source:'Export Sytex',syncedAt:r.import.importedAt.toISOString()})),
  ]);
  const byKey=new Map(reviews.map(r=>[r.source_key,reviewContract(r)]));
  return all.map(r=>{const review=byKey.get(r.key)??null,changed=!!review&&review.sourceHash!==r.hash;return {...r,review,changed,files:files.filter(f=>f.source_key===r.key).map(f=>({id:f.id,fileName:f.file_name,mimeType:f.mime_type})),...materialAlert({...r,review,changed})};}).filter(r=>{
    const assigned=r.review?.project || (r.projects.length===1?r.projects[0]:'');
    if(actor.allowed!==null)return !!assigned&&projects.includes(assigned)&&allowedProject(assigned,actor.allowed);
    return !requested.length || (!!assigned&&projects.includes(assigned));
  });
}
export type ReviewInput={key:string;project:string;classification:string;intraStatus:string;invoiceNumber:string;countedQuantity:string|null;intraQuantity:string|null;notes:string;version:number;sourceHash:string};
export async function saveReview(actor:OperationsActor,input:ReviewInput){
  const row=(await materials(actor)).find(r=>r.key===input.key);if(!row)fail('NOT_FOUND',404);
  const c=await catalog(actor);if(!c.projects.includes(input.project))fail('FORBIDDEN_PROJECT',403);
  if(actor.allowed!==null&&row.projects.length&& !row.projects.includes(input.project))fail('FORBIDDEN_PROJECT',403);
  if(row.hash!==input.sourceHash)fail('SOURCE_CHANGED');
  if(input.intraStatus==='DESCARGADO'&&(input.countedQuantity===null||input.intraQuantity===null||Number(input.countedQuantity)!==Number(input.intraQuantity)||(row.quantity!==null&&Number(input.countedQuantity)!==Number(row.quantity))))fail('QUANTITIES_DO_NOT_MATCH',422);
  if(['DESCARGADO','NO_CORRESPONDE'].includes(input.intraStatus)&&input.classification==='PENDIENTE')fail('CLASSIFICATION_REQUIRED',422);
  if(input.intraStatus==='DESCARGADO'&&input.classification==='NO_INCLUIDO'&&!input.invoiceNumber.trim())fail('INVOICE_NUMBER_REQUIRED',422);
  if(input.intraStatus==='NO_CORRESPONDE'&&!input.notes.trim())fail('REASON_REQUIRED',422);
  return getPrismaClient().$transaction(async tx=>{
    await tx.$executeRaw`INSERT INTO ops_supply_reviews(source_key,project,source_hash,updated_by) VALUES (${input.key},${input.project},${input.sourceHash},${actor.user.id}::uuid) ON CONFLICT DO NOTHING`;
    const updated=await tx.$executeRaw`UPDATE ops_supply_reviews SET project=${input.project},classification=${input.classification},intra_status=${input.intraStatus},invoice_number=${input.invoiceNumber},counted_quantity=${input.countedQuantity}::numeric,intra_quantity=${input.intraQuantity}::numeric,notes=${input.notes},source_hash=${input.sourceHash},version=version+1,updated_by=${actor.user.id}::uuid,updated_at=CURRENT_TIMESTAMP WHERE source_key=${input.key} AND version=${input.version}`;
    if(!updated)fail('STALE_VERSION');await audit(tx,actor,input.key,'INTRA_REVIEW_SAVED',input);return {saved:true};
  });
}
