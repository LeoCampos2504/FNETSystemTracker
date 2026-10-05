import { createHash } from 'node:crypto';
import type { Material, SourceMaterial } from '@/contracts/operations';
export function projectKey(value:string|null|undefined):string {
  return (value??'').trim().normalize('NFKC').replace(/\s+/g,' ');
}
export function allowedProject(project:string, allowed:string[]|null):boolean { return !!project && (allowed===null || allowed.includes(project)); }
export function selectProjects(requested:string[], available:string[]):string[] { const selected=requested.length?requested:available; if(selected.some(p=>!available.includes(p))) throw new Error('FORBIDDEN_PROJECT'); return [...new Set(selected)]; }
export function sourceIdentity(form:string,group:string|null,index:string|null):string { return JSON.stringify([form.trim(),(group??'').trim().normalize('NFKC'),(index??'').trim().normalize('NFKC')]); }
export function sourceHash(value:Pick<SourceMaterial,'description'|'quantity'|'siteCode'>):string { return createHash('sha256').update(JSON.stringify([value.description,value.quantity===null?null:Number(value.quantity),value.siteCode])).digest('hex'); }
export function mergeMaterials(rows:SourceMaterial[]):SourceMaterial[] {
  const map=new Map<string,SourceMaterial>();
  for(const row of rows){ const prior=map.get(row.key); if(!prior || row.syncedAt>prior.syncedAt || (row.syncedAt===prior.syncedAt && row.source==='Export Sytex')) map.set(row.key,row); }
  return [...map.values()];
}
const sameMaterial=(row:SourceMaterial)=>JSON.stringify([row.formulario.trim(),row.siteCode.trim().toUpperCase(),(row.provider??'').trim().toLowerCase(),row.description.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ')]);
/** The same insumo repeated in one form (three lines of "Llave térmica", one each) is one row whose quantity is the total. A line without quantity counts as one unit when it is repeated. The first line (by group and index) represents the rest: its key carries the review. */
export function groupMaterials(rows:SourceMaterial[]):SourceMaterial[] {
  const groups=new Map<string,SourceMaterial[]>();
  for(const row of rows){const key=sameMaterial(row);groups.set(key,[...(groups.get(key)??[]),row]);}
  return [...groups.values()].map(members=>{
    const [first,...rest]=[...members].sort((a,b)=>a.key.localeCompare(b.key,'es',{numeric:true}));
    if(!rest.length)return {...first,lines:1};
    const total=members.reduce((sum,m)=>sum+(m.quantity===null?1:Number(m.quantity)),0),quantity=String(Math.round(total*1000)/1000);
    const newest=members.reduce((a,b)=>b.syncedAt>a.syncedAt?b:a);
    const value={...first,quantity,lines:members.length,syncedAt:newest.syncedAt,editedAt:members.map(m=>m.editedAt??'').sort().pop()||first.editedAt};
    return {...value,hash:sourceHash(value)};
  });
}
export function materialAlert(row:Pick<Material,'quantity'|'review'|'changed'>) {
  const expected=row.quantity===null?null:Number(row.quantity), counted=row.review?.countedQuantity==null?null:Number(row.review.countedQuantity), intra=row.review?.intraQuantity==null?null:Number(row.review.intraQuantity);
  const difference=counted===null||intra===null?null:Math.round((counted-intra)*1000)/1000;
  const missing=row.changed || !row.review || row.review.classification==='PENDIENTE' || row.review.intraStatus==='PENDIENTE' || row.review.intraStatus==='PARCIAL' || (row.review.intraStatus==='DESCARGADO' && (difference!==0 || counted===null || (expected!==null && counted!==expected)));
  return {difference,missing};
}
export const safeImage=(value:unknown):string|null=>{ if(typeof value!=='string')return null; try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;} };
