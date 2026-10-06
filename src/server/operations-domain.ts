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
const fold=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const CODE_WORD=/\b(?:c[oó]d(?:igo)?\.?|serie|s\/n|sn|n[°º]|nro\.?|n[uú]mero)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9\-/.]*[A-Za-z0-9]|[A-Za-z0-9])/gi;
const NOT_A_CODE=[/^\d+(?:[.,]\d+)?[x×]\d+(?:[.,]\d+)?(?:[x×]\d+)?[a-z]{0,3}$/i,/^\d+(?:[.,]\d+)?[a-z]{1,4}$/i,/^[a-z]+-?\d{1,3}[a-z]?$/i];
const looksLikeCode=(token:string)=>/^\d{6,}$/.test(token)||(/[a-z]/i.test(token)&&/\d/.test(token)&&token.length>=5&&/^[a-z0-9][a-z0-9\-_/.]*$/i.test(token)&&!NOT_A_CODE.some(pattern=>pattern.test(token)));
const uniqueCodes=(codes:string[])=>{const seen=new Set<string>();return codes.filter(code=>{const key=code.toUpperCase();if(seen.has(key))return false;seen.add(key);return true;});};
/** Splits an insumo text into its name and the codes it carries (serial, "Código: …", long numbers). Sizes, ratings and models like "50x50", "3000W", "C63" or "RJ45" stay in the name. */
export function splitCodes(description:string):{name:string;codes:string[]} {
  const codes:string[]=[];
  const withoutWords=description.replace(CODE_WORD,(_,code:string)=>{codes.push(code);return ' ';});
  const name=withoutWords.split(/\s+/).filter(Boolean).filter(token=>{const clean=token.replace(/^[([{,;:]+|[)\]},;:.]+$/g,'');if(!looksLikeCode(clean))return true;codes.push(clean);return false;}).join(' ').replace(/[\s,;:\-–]+$/,'').trim();
  return {name,codes:uniqueCodes(codes)};
}
const sameMaterial=(row:SourceMaterial,name:string)=>JSON.stringify([row.formulario.trim(),row.siteCode.trim().toUpperCase(),(row.provider??'').trim().toLowerCase(),fold(name)]);
/** The same insumo repeated in one form (three lines of "Llave térmica", one each) is one row whose quantity is the total. Lines that differ only by a code (modules with a serial number) are summed by name and the codes are listed. A line without quantity counts as one unit when it is repeated. The first line (by group and index) represents the rest: its key carries the review. */
export function groupMaterials(rows:SourceMaterial[]):SourceMaterial[] {
  const groups=new Map<string,{row:SourceMaterial;name:string;codes:string[]}[]>();
  for(const row of rows){const {name,codes}=splitCodes(row.description);const clean=name||row.description,key=sameMaterial(row,clean);groups.set(key,[...(groups.get(key)??[]),{row,name:clean,codes}]);}
  return [...groups.values()].map(entries=>{
    const members=entries.map(entry=>entry.row),[first,...rest]=[...members].sort((a,b)=>a.key.localeCompare(b.key,'es',{numeric:true}));
    if(!rest.length)return {...first,lines:1};
    const total=members.reduce((sum,m)=>sum+(m.quantity===null?1:Number(m.quantity)),0),quantity=String(Math.round(total*1000)/1000);
    const newest=members.reduce((a,b)=>b.syncedAt>a.syncedAt?b:a),codes=uniqueCodes(entries.flatMap(entry=>entry.codes));
    const description=codes.length?entries.find(entry=>entry.row===first)!.name:first.description;
    const value={...first,description,quantity,lines:members.length,syncedAt:newest.syncedAt,editedAt:members.map(m=>m.editedAt??'').sort().pop()||first.editedAt,...(codes.length?{codes}:{})};
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
