"use client";
import { useEffect,useMemo,useState,type FormEvent } from 'react';
import type { GuardOverview,OffHoursVisit } from '@/contracts/operations';
import { addDays,guardSummary,mondayOf,monthRange } from '@/lib/guard-domain';
import { Feedback,opCall,operationToday,projectLabel,useOperation } from './operations-common';
import s from './operations.module.css';
const fmt=(day:string)=>day.split('-').reverse().slice(0,2).join('/');
const statusText:Record<string,string>={PLANIFICADO:'Planificado',EN_CURSO:'En curso',REALIZADO:'Realizado',CON_PENDIENTES:'Con pendientes',CANCELADO:'Cancelado'};
function useOverview(from:string,to:string,revision:number){
 const [data,setData]=useState<GuardOverview|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;opCall<GuardOverview>('/api/operations/guard?from='+from+'&to='+to).then(o=>{if(active){setData(o);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[from,to,revision]);
 return {data,error};
}
function OffHoursTable({items,editable,onSaved}:{items:OffHoursVisit[];editable:boolean;onSaved:()=>void}){
 const op=useOperation();
 const save=(id:string,value:string)=>op.run(async()=>{const hours=value.trim()===''?null:Number(value.replace(',','.'));await opCall('/api/operations/guard',{action:'setHours',visitId:id,hours});onSaved();op.setSuccess('Horas guardadas.');});
 if(!items.length)return <p className={s.note}>No hay tareas fuera de horario laboral en este período.</p>;
 return <><Feedback {...op}/><div className={s.tableWrap}><table className={s.compact}><thead><tr>{['Fecha','Zona','Sitio','Tarea','Técnicos','Estado',...(editable?['Horas']:['Resultado'])].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{items.map(v=><tr key={v.id}><td className={s.nowrap}>{fmt(v.day)}</td><td className={s.nowrap}>{projectLabel(v.project)}</td><td>{v.siteCode}<small>{v.siteName}</small></td><td>{v.taskCode||'Imprevisto'}</td><td>{v.technicians.join(' / ')}</td><td>{statusText[v.status]??v.status}</td>
  <td>{editable?<input aria-label={'Horas de '+v.siteCode} style={{width:90}} inputMode="decimal" defaultValue={v.hours??''} placeholder="0,5" onBlur={e=>{if(e.target.value!==String(v.hours??''))void save(v.id,e.target.value);}}/>:v.outcome||'—'}</td></tr>)}</tbody></table></div></>;
}
/** Coordination: who is on passive guard each week, the holidays, the off-hours hours and the month-end Excel. */
export function GuardDuty(){
 const op=useOperation(),[month,setMonth]=useState(()=>operationToday().slice(0,7)),[revision,setRevision]=useState(0),[tech,setTech]=useState(''),[pick,setPick]=useState(()=>operationToday()),[holidayDay,setHolidayDay]=useState(''),[holidayName,setHolidayName]=useState('');
 const {from,to}=monthRange(month),{data,error}=useOverview(from,to,revision),refresh=()=>setRevision(v=>v+1);
 const summary=useMemo(()=>data?guardSummary(data.weeks,data.holidays.map(h=>h.day),data.offHours,month):[],[data,month]);
 const start=mondayOf(pick);
 const addWeek=(e:FormEvent)=>{e.preventDefault();void op.run(async()=>{const r=await opCall<{alreadyLoaded:boolean}>('/api/operations/guard',{action:'addWeek',technician:tech,weekStart:start});setTech('');refresh();op.setSuccess(r.alreadyLoaded?'Esa guardia ya estaba cargada.':'Guardia cargada.');});};
 const addHoliday=(e:FormEvent)=>{e.preventDefault();void op.run(async()=>{await opCall('/api/operations/guard',{action:'addHoliday',day:holidayDay,name:holidayName});setHolidayDay('');setHolidayName('');refresh();op.setSuccess('Feriado guardado.');});};
 const remove=(body:object,ask:string)=>{if(window.confirm(ask))void op.run(async()=>{await opCall('/api/operations/guard',body);refresh();});};
 return <section className={s.app}><header className={s.heading}><div><div className={s.kicker}>GUARDIA PASIVA Y FUERA DE HORARIO</div><h1>Guardias</h1><p className={s.note}>Cargá la semana (de lunes a domingo) de cada técnico de guardia. A fin de mes descargá el Excel con los días de guardia, sábados, domingos, feriados y las horas de tareas fuera de horario laboral.</p></div></header>
 <Feedback error={error}/><Feedback {...op}/>
 <div className={s.toolbar}><label>Mes<input type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label><a className={s.button} href={'/api/operations/export?kind=guard&month='+month}>Descargar Excel del mes</a></div>
 <div className={s.card}><h2>Cargar guardia pasiva</h2><form onSubmit={addWeek}><div className={s.fields}><label>Técnico<input required list="guard-technicians" maxLength={200} value={tech} onChange={e=>setTech(e.target.value)} placeholder="Nombre del técnico"/></label><datalist id="guard-technicians">{(data?.technicians??[]).map(t=><option key={t} value={t}/>)}</datalist><label>Un día de la semana de guardia<input type="date" required value={pick} onChange={e=>{if(e.target.value)setPick(e.target.value);}}/></label></div><p className={s.note}>Semana de guardia: del lunes {fmt(start)} al domingo {fmt(addDays(start,6))}.</p><button className={s.primary} disabled={op.busy}>Agregar guardia</button></form></div>
 <div className={s.card}><h2>Guardias de {month.split('-').reverse().join('/')}</h2>{data&&!data.weeks.length&&<p className={s.note}>Todavía no hay guardias cargadas en este mes.</p>}{data?.weeks.map(w=><p key={w.id}><strong>{w.technician}</strong> · lunes {fmt(w.weekStart)} a domingo {fmt(w.weekEnd)} <button disabled={op.busy} onClick={()=>remove({action:'removeWeek',id:w.id},'¿Quitar la guardia de '+w.technician+' de la semana del '+fmt(w.weekStart)+'?')}>Quitar</button></p>)}</div>
 <div className={s.card}><h2>Resumen del mes</h2>{!summary.length?<p className={s.note}>Sin datos para este mes.</p>:<div className={s.tableWrap}><table className={s.compact}><thead><tr>{['Técnico','Días de guardia','Lun a vie','Sábados','Domingos','Feriados','Tareas fuera de horario','Horas'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{summary.map(r=><tr key={r.technician}><td><strong>{r.technician}</strong></td><td>{r.days}</td><td>{r.weekdays}</td><td>{r.saturdays}</td><td>{r.sundays}</td><td>{r.holidays}</td><td>{r.tasks}</td><td>{r.hours}</td></tr>)}</tbody></table></div>}<p className={s.note}>Un feriado cuenta como feriado aunque caiga en día de semana. Solo se cuentan los días de la guardia que caen dentro del mes.</p></div>
 <div className={s.card}><h2>Feriados</h2><form onSubmit={addHoliday}><div className={s.fields}><label>Fecha<input type="date" required value={holidayDay} onChange={e=>setHolidayDay(e.target.value)}/></label><label>Nombre<input required maxLength={200} value={holidayName} onChange={e=>setHolidayName(e.target.value)} placeholder="Ej.: Día de la Soberanía Nacional"/></label></div><button className={s.primary} disabled={op.busy}>Guardar feriado</button></form>{data?.holidays.map(h=><p key={h.day}>{fmt(h.day)} · {h.name} <button disabled={op.busy} onClick={()=>remove({action:'removeHoliday',day:h.day},'¿Quitar el feriado del '+fmt(h.day)+'?')}>Quitar</button></p>)}{data&&!data.holidays.length&&<p className={s.note}>No hay feriados cargados en este mes: cargalos para que se cuenten aparte.</p>}</div>
 <div className={s.card}><h2>Tareas fuera de horario laboral</h2><p className={s.note}>Son las visitas del cronograma marcadas como "Fuera de horario". Anotá las horas que llevó cada una; en una tarea con varios técnicos, cada uno suma esas horas.</p>{data&&<OffHoursTable items={data.offHours} editable onSaved={refresh}/>}</div></section>;
}
/** CTIC: read-only view of this and next week's guard technicians and the tasks outside working hours. */
export function CticView({onLogout}:{onLogout:()=>void}){
 const monday=mondayOf(operationToday()),from=addDays(monday,-7),to=addDays(monday,13),{data,error}=useOverview(from,to,0);
 const current=data?.weeks.filter(w=>w.weekStart===monday)??[],next=data?.weeks.filter(w=>w.weekStart===addDays(monday,7))??[];
 return <main className={s.shell}><div className={s.app}><header className={s.heading}><strong>FNET TRACKER · CTIC</strong><button onClick={async()=>{const r=await fetch('/api/auth/logout',{method:'POST'});if(r.ok)onLogout();}}>Cerrar sesión</button></header>
 <Feedback error={error}/>
 <div className={s.card}><h2>Técnicos de guardia esta semana</h2><p className={s.note}>Del lunes {fmt(monday)} al domingo {fmt(addDays(monday,6))}.</p>{data&&!current.length&&<p>No hay guardia cargada para esta semana.</p>}{current.map(w=><p key={w.id}><strong>{w.technician}</strong></p>)}</div>
 <div className={s.card}><h2>Guardia de la semana próxima</h2><p className={s.note}>Del lunes {fmt(addDays(monday,7))} al domingo {fmt(addDays(monday,13))}.</p>{data&&!next.length&&<p>Todavía no hay guardia cargada.</p>}{next.map(w=><p key={w.id}><strong>{w.technician}</strong></p>)}</div>
 <div className={s.card}><h2>Tareas fuera de horario laboral</h2><p className={s.note}>Fuera de lunes a viernes de 8 a 18 (hora de Argentina). Se muestran las últimas dos semanas y las próximas.</p>{data&&<OffHoursTable items={data.offHours} editable={false} onSaved={()=>undefined}/>}</div></div></main>;
}
