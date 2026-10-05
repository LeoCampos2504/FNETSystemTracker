"use client";
import { useEffect,useRef,useState } from 'react';
import type { OperationsCatalog } from '@/contracts/operations';
import s from './operations.module.css';
const errors:Record<string,string>={
 UNAUTHENTICATED:'Ingresá con tu cuenta para continuar.',FORBIDDEN:'Tu cuenta no tiene permiso para esta acción.',FORBIDDEN_PROJECT:'La zona seleccionada no está habilitada para tu cuenta.',
 INPUT_INVALID:'Revisá los campos. Las cantidades admiten hasta tres decimales separados con punto.',SUPPLY_DATABASE_UNAVAILABLE:'No se pudo consultar la base. Reintentá; no se confirmó ningún cambio.',STALE_VERSION:'Otra persona modificó el registro. Actualizá y volvé a abrirlo.',SOURCE_CHANGED:'Sytex cambió desde que abriste el registro. Actualizá para revisar la cantidad nueva.',
 DAY_CLOSED:'La jornada ya está cerrada y se conserva como historial.',UNFINISHED_VISITS:'Antes de cerrar, indicá el resultado de las visitas planificadas o en curso.',NO_OPEN_DAY_WITH_VISITS:'No hay visitas abiertas para cerrar con este filtro.',FUTURE_DAY_CANNOT_CLOSE:'Una jornada futura todavía no se puede cerrar.',
 QUANTITIES_DO_NOT_MATCH:'Para confirmar la descarga deben coincidir la cantidad de Sytex, el conteo y la cantidad en Intra.',CLASSIFICATION_REQUIRED:'Definí primero si el insumo está incluido o no.',INVOICE_NUMBER_REQUIRED:'Indicá el número de factura del insumo no incluido.',REASON_REQUIRED:'Explicá en observaciones por qué no corresponde descargarlo.',
 TASK_NOT_IN_PROJECT:'La tarea no pertenece al proyecto y tipo seleccionados.',TASK_SITE_MISMATCH:'El sitio debe coincidir con el informado en la tarea.',DUPLICATE_TECHNICIANS:'El mismo técnico aparece más de una vez.',CONCURRENT_OR_DUPLICATE_RECORD:'Ya existe ese registro. Actualizá el listado.',REQUEST_KEY_REUSED:'La solicitud anterior ya se guardó con otros datos. Volvé a abrir el formulario.',
 SAVE_REVIEW_FIRST:'Guardá el control antes de adjuntar un comprobante.',FILE_TYPE_INVALID:'Adjuntá un PDF, JPG, PNG o WebP válido.',FILE_TOO_LARGE:'El límite es 8 MB por archivo.',INVOICE_FILE_LIMIT:'Se permiten hasta 6 archivos y 24 MB por registro.'
};
export async function opCall<T>(url:string,body?:unknown):Promise<T>{
 const r=await fetch(url,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 const data=await r.json();if(!r.ok)throw new Error(errors[data.code]??'No se pudo completar la operación. Actualizá e intentá nuevamente.');return data;
}
export const operationsUrl=(kind:string,projects:string[],day?:string,exported=false)=>{const p=new URLSearchParams({kind});projects.forEach(v=>p.append('project',v));if(day)p.set('day',day);return '/api/operations'+(exported?'/export':'')+'?'+p.toString();};
export const operationToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const splitTechnicians=(v:string)=>v.split(/[,;\n]/).map(t=>t.trim()).filter(Boolean);
export function useCatalog(){
 const [data,setData]=useState<OperationsCatalog|null>(null),[projects,setProjects]=useState<string[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;opCall<OperationsCatalog>('/api/operations').then(c=>{if(active){setData(c);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 return {data,setData,projects,setProjects,error};
}
export function useOperation(){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[success,setSuccess]=useState(''),locked=useRef(false);
 const run=async(f:()=>Promise<void>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError('');setSuccess('');try{await f();}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{locked.current=false;setBusy(false);}};
 return {error,busy,success,setSuccess,run};
}
export function Feedback({error,success}:{error?:string;success?:string}){return <>{error&&<p className={s.error} role="alert">{error}</p>}{success&&<p className={s.success} role="status">{success}</p>}</>;}
export function ProjectPicker({options,selected,onChange,label='Agregar proyecto al filtro'}:{options:string[];selected:string[];onChange:(projects:string[])=>void;label?:string}){
 const [query,setQuery]=useState('');
 const available=options.filter(p=>!selected.includes(p)&&p.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
 return <div className={s.projectPicker}><label>Buscar proyecto de Sytex<input aria-label="Buscar proyecto de Sytex" placeholder="Escribí parte del nombre completo…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <label>{label}<select aria-label={label} value="" onChange={e=>{if(e.target.value)onChange([...selected,e.target.value]);setQuery('');}}><option value="">Seleccionar un proyecto de Sytex…</option>{available.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
 {query&&!available.length&&<p className={s.note}>No hay más proyectos disponibles con esa búsqueda.</p>}
 <div className={s.projectChips}>{selected.map(p=><button key={p} type="button" aria-label={'Quitar '+p} onClick={()=>onChange(selected.filter(v=>v!==p))}>{p} ×</button>)}</div></div>;
}
const typeLabels:Record<string,string>={PREVENTIVO:'Preventivo',CORRECTIVO:'Correctivo',OTRO:'Otros'};
/** "NON - MPC Mantenimiento Preventivo Civil O&M" → zona NON, tipo PREVENTIVO. */
export function projectZone(project:string){
 const cut=project.indexOf(' - '),zone=(cut>0?project.slice(0,cut):project).trim().toUpperCase(),rest=cut>0?project.slice(cut+3):'';
 const type=/\bMPC\b|preventiv/i.test(rest)?'PREVENTIVO':/\bMCC|correctiv/i.test(rest)?'CORRECTIVO':'OTRO';
 return {zone,type};
}
export const projectLabel=(project:string)=>{const z=projectZone(project);return z.zone+' · '+typeLabels[z.type];};
export function ZoneFilter({state}:{state:ReturnType<typeof useCatalog>}){
 const [zone,setZone]=useState(''),[type,setType]=useState('');
 if(!state.data)return <Feedback error={state.error}/>;
 const all=state.data.projects.map(p=>({project:p,...projectZone(p)}));
 const zones=[...new Set(all.map(p=>p.zone))].sort((a,b)=>a.localeCompare(b,'es'));
 const typesFor=(z:string)=>['PREVENTIVO','CORRECTIVO','OTRO'].filter(t=>all.some(p=>(!z||p.zone===z)&&p.type===t));
 const apply=(z:string,t:string)=>{const kept=typesFor(z).includes(t)?t:'';setZone(z);setType(kept);state.setProjects(z||kept?all.filter(p=>(!z||p.zone===z)&&(!kept||p.type===kept)).map(p=>p.project):[]);};
 return <div className={s.zoneFilter}><label>Zona<select aria-label="Zona" value={zone} onChange={e=>apply(e.target.value,type)}><option value="">Todas las zonas</option>{zones.map(z=><option key={z} value={z}>{z}</option>)}</select></label>
 <label>Tipo<select aria-label="Tipo de mantenimiento" value={type} onChange={e=>apply(zone,e.target.value)}><option value="">Preventivos y correctivos</option>{typesFor(zone).map(t=><option key={t} value={t}>{typeLabels[t]}</option>)}</select></label></div>;
}
