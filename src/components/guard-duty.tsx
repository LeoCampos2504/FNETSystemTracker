"use client";
import { useEffect,useMemo,useState,type FormEvent } from 'react';
import type { GuardOverview,OffHoursVisit } from '@/contracts/operations';
import { addDays,daysBetween,guardSummary,mondayOf,monthRange,validPeriod,weekdayName } from '@/lib/guard-domain';
import { Feedback,opCall,operationToday,projectLabel,useOperation } from './operations-common';
import s from './operations.module.css';
const fmt=(day:string)=>day.split('-').reverse().slice(0,2).join('/');
const long=(day:string)=>weekdayName(day)+' '+fmt(day);
const range=(from:string,to:string)=>from===to?'el '+long(from):'del '+long(from)+' al '+long(to);
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
/** Coordination: who is on passive guard and between which dates, the holidays, the off-hours hours and the month-end Excel. */
export function GuardDuty(){
 const op=useOperation(),[month,setMonth]=useState(()=>operationToday().slice(0,7)),[revision,setRevision]=useState(0),[tech,setTech]=useState(''),[from,setFrom]=useState(()=>operationToday()),[to,setTo]=useState(()=>addDays(operationToday(),6)),[editing,setEditing]=useState<string|null>(null),[holidayFrom,setHolidayFrom]=useState(''),[holidayTo,setHolidayTo]=useState(''),[holidayName,setHolidayName]=useState('');
 const {from:monthFrom,to:monthTo}=monthRange(month),{data,error}=useOverview(monthFrom,monthTo,revision),refresh=()=>setRevision(v=>v+1);
 const summary=useMemo(()=>data?guardSummary(data.periods,data.holidays.map(h=>h.day),data.offHours,month):[],[data,month]);
 const valid=validPeriod(from,to),count=valid?daysBetween(from,to).length:0;
 const pickFrom=(value:string)=>{if(!value)return;setFrom(value);if(!to||to<value)setTo(addDays(value,6));};
 const reset=()=>{setEditing(null);setTech('');};
 const savePeriod=(e:FormEvent)=>{e.preventDefault();void op.run(async()=>{
  if(editing){await opCall('/api/operations/guard',{action:'updatePeriod',id:editing,technician:tech,from,to});op.setSuccess('Guardia modificada.');}
  else{const r=await opCall<{alreadyLoaded:boolean}>('/api/operations/guard',{action:'addPeriod',technician:tech,from,to});op.setSuccess(r.alreadyLoaded?'Esa guardia ya estaba cargada.':'Guardia cargada.');}
  reset();setMonth(from.slice(0,7));refresh();});};
 const edit=(p:{id:string;technician:string;from:string;to:string})=>{setEditing(p.id);setTech(p.technician);setFrom(p.from);setTo(p.to);window.scrollTo({top:0,behavior:'smooth'});};
 const addHoliday=(e:FormEvent)=>{e.preventDefault();void op.run(async()=>{const r=await opCall<{days:number}>('/api/operations/guard',{action:'addHoliday',day:holidayFrom,...(holidayTo&&holidayTo!==holidayFrom?{to:holidayTo}:{}),name:holidayName});setHolidayFrom('');setHolidayTo('');setHolidayName('');refresh();op.setSuccess(r.days>1?r.days+' feriados guardados.':'Feriado guardado.');});};
 const remove=(body:object,ask:string)=>{if(window.confirm(ask))void op.run(async()=>{await opCall('/api/operations/guard',body);refresh();});};
 return <section className={s.app}><header className={s.heading}><div><div className={s.kicker}>Guardia pasiva y horas fuera de horario</div><h1>Guardias</h1><p className={s.note}>Cargá cada guardia pasiva con su fecha de inicio y de fin (puede empezar cualquier día y se puede modificar). A fin de mes descargá el Excel con los días de guardia, los días no laborales (sábados, domingos y feriados) y las horas de tareas fuera de horario laboral.</p></div></header>
 <Feedback error={error}/><Feedback {...op}/>
 <div className={s.toolbar}><label>Mes<input type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label><a className={s.button} href={'/api/operations/export?kind=guard&month='+month}>Descargar Excel del mes</a></div>
 <div className={s.card}><h2>{editing?'Modificar guardia pasiva':'Cargar guardia pasiva'}</h2><form onSubmit={savePeriod}><div className={s.fields}><label>Técnico<input required list="guard-technicians" maxLength={200} value={tech} onChange={e=>setTech(e.target.value)} placeholder="Nombre del técnico"/></label><datalist id="guard-technicians">{(data?.technicians??[]).map(t=><option key={t} value={t}/>)}</datalist><label>Desde<input type="date" required value={from} onChange={e=>pickFrom(e.target.value)}/></label><label>Hasta (incluido)<input type="date" required min={from} value={to} onChange={e=>{if(e.target.value)setTo(e.target.value);}}/></label></div><p className={s.note}>{valid?'Guardia '+range(from,to)+': '+count+(count===1?' día.':' días.'):'Revisá las fechas: "Hasta" no puede ser anterior a "Desde" ni pasar de 92 días.'}</p><div className={s.actions}><button className={s.primary} disabled={op.busy||!valid}>{editing?'Guardar cambios':'Agregar guardia'}</button>{editing&&<button type="button" disabled={op.busy} onClick={reset}>Cancelar</button>}</div></form></div>
 <div className={s.card}><h2>Guardias de {month.split('-').reverse().join('/')}</h2><p className={s.note}>Se muestran las guardias que tocan este mes; una guardia que cruza de mes aparece en los dos y en cada uno cuenta solo sus días.</p>{data&&!data.periods.length&&<p className={s.note}>Todavía no hay guardias cargadas en este mes.</p>}{data?.periods.map(w=><p key={w.id}><strong>{w.technician}</strong> · {range(w.from,w.to)} ({daysBetween(w.from,w.to).length} días) <button disabled={op.busy} onClick={()=>edit(w)}>Editar</button> <button disabled={op.busy} onClick={()=>remove({action:'removePeriod',id:w.id},'¿Quitar la guardia de '+w.technician+' '+range(w.from,w.to)+'?')}>Quitar</button></p>)}</div>
 <div className={s.card}><h2>Resumen del mes</h2>{!summary.length?<p className={s.note}>Sin datos para este mes.</p>:<div className={s.tableWrap}><table className={s.compact}><thead><tr>{['Técnico','Días de guardia','Días hábiles','Días no laborales','Tareas fuera de horario','Horas'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{summary.map(r=><tr key={r.technician}><td><strong>{r.technician}</strong></td><td>{r.days}</td><td>{r.weekdays}</td><td>{r.nonWorking}</td><td>{r.tasks}</td><td>{r.hours}</td></tr>)}</tbody></table></div>}<p className={s.note}>Días no laborales = sábados, domingos y feriados; cada día se cuenta una sola vez (un feriado en fin de semana no suma doble). Solo se cuentan los días de la guardia que caen dentro del mes.</p></div>
 <div className={s.card}><h2>Feriados</h2><p className={s.note}>Cargá un feriado o varios días seguidos (por ejemplo un fin de semana largo) completando &quot;Hasta&quot;. El nombre es opcional. Sirve también para feriados locales.</p><form onSubmit={addHoliday}><div className={s.fields}><label>Desde<input type="date" required value={holidayFrom} onChange={e=>setHolidayFrom(e.target.value)}/></label><label>Hasta (opcional)<input type="date" min={holidayFrom} value={holidayTo} onChange={e=>setHolidayTo(e.target.value)}/></label><label>Nombre (opcional)<input maxLength={200} value={holidayName} onChange={e=>setHolidayName(e.target.value)} placeholder="Ej.: Día de la Soberanía Nacional"/></label></div><button className={s.primary} disabled={op.busy}>Guardar feriado</button></form>{data?.holidays.map(h=><p key={h.day}>{long(h.day)} · {h.name} <button disabled={op.busy} onClick={()=>remove({action:'removeHoliday',day:h.day},'¿Quitar el feriado del '+fmt(h.day)+'?')}>Quitar</button></p>)}{data&&!data.holidays.length&&<p className={s.note}>No hay feriados cargados en este mes: cargalos para que cuenten como días no laborales.</p>}</div>
 <div className={s.card}><h2>Tareas fuera de horario laboral</h2><p className={s.note}>Son las visitas del cronograma marcadas como &quot;Fuera de horario&quot;. Anotá las horas que llevó cada una; en una tarea con varios técnicos, cada uno suma esas horas.</p>{data&&<OffHoursTable items={data.offHours} editable onSaved={refresh}/>}</div></section>;
}
/** CTIC: read-only view of who is on guard today, the guards of the next two weeks and the tasks outside working hours. */
export function CticView({onLogout}:{onLogout:()=>void}){
 const today=operationToday(),from=addDays(mondayOf(today),-7),to=addDays(today,14),{data,error}=useOverview(from,to,0);
 const current=data?.periods.filter(w=>w.from<=today&&today<=w.to)??[],next=data?.periods.filter(w=>w.from>today)??[];
 return <main className={s.shell}><div className={s.app}><header className={s.heading}><strong>FNET TRACKER · CTIC</strong><button onClick={async()=>{const r=await fetch('/api/auth/logout',{method:'POST'});if(r.ok)onLogout();}}>Cerrar sesión</button></header>
 <Feedback error={error}/>
 <div className={s.card}><h2>Técnicos de guardia hoy</h2>{data&&!current.length&&<p>No hay guardia cargada para hoy.</p>}{current.map(w=><p key={w.id}><strong>{w.technician}</strong> · {range(w.from,w.to)}</p>)}</div>
 <div className={s.card}><h2>Próximas guardias</h2><p className={s.note}>Las que empiezan en los próximos 14 días.</p>{data&&!next.length&&<p>Todavía no hay guardia cargada.</p>}{next.map(w=><p key={w.id}><strong>{w.technician}</strong> · {range(w.from,w.to)}</p>)}</div>
 <div className={s.card}><h2>Tareas fuera de horario laboral</h2><p className={s.note}>Fuera de lunes a viernes de 8 a 18 (hora de Argentina). Se muestran las últimas dos semanas y las próximas.</p>{data&&<OffHoursTable items={data.offHours} editable={false} onSaved={()=>undefined}/>}</div></div></main>;
}
