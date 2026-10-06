"use client";
import { useEffect,useMemo,useState } from 'react';
import type { Material } from '@/contracts/operations';
import { fold,stockByTechnician } from '@/lib/supply-stock';
import { Feedback,opCall,operationsUrl,projectLabel,useCatalog,ZoneFilter } from './operations-common';
import s from './operations.module.css';
const date=(value:string|null|undefined)=>value?value.slice(0,10).split('-').reverse().join('/'):'—';
/** What was marked as not included stays with the main technician of the form, who bought it. */
export function TechnicianStock(){
 const zones=useCatalog(),[items,setItems]=useState<Material[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[search,setSearch]=useState(''),[technician,setTechnician]=useState('');
 const filter=zones.projects.join('|');
 useEffect(()=>{if(!zones.data)return;let active=true;const timer=setTimeout(()=>{setLoading(true);opCall<{items:Material[]}>(operationsUrl('materials',zones.projects)).then(d=>{if(active){setItems(d.items);setError('');}}).catch(e=>{if(active){setError(e.message);setItems([]);}}).finally(()=>{if(active)setLoading(false);});},0);return()=>{active=false;clearTimeout(timer);};},[filter,zones.data]); // eslint-disable-line react-hooks/exhaustive-deps
 // The technicians of the chosen zone come from its tasks; whoever already holds stock there is added too.
 const all=useMemo(()=>stockByTechnician(items),[items]);
 const roster=useMemo(()=>{const names=new Map<string,string>();const tasks=(zones.data?.tasks??[]).filter(t=>!zones.projects.length||zones.projects.includes(t.project));
  for(const name of [...tasks.flatMap(t=>t.technicians),...all.map(g=>g.technician)]){const key=fold(name);if(key&&!names.has(key))names.set(key,name);}
  return [...names.entries()].map(([key,name])=>({key,name,group:all.find(g=>fold(g.technician)===key)})).sort((a,b)=>(a.group?0:1)-(b.group?0:1)||a.name.localeCompare(b.name,'es'));},[zones.data,zones.projects,all]);
 const chosen=roster.find(r=>r.key===technician)?.key??'';
 const term=search.toLocaleLowerCase(),groups=all.filter(g=>!chosen||fold(g.technician)===chosen).map(g=>({...g,lines:g.lines.filter(l=>[l.description,l.formulario,l.siteCode,l.siteName,g.technician,l.review?.invoiceNumber].join(' ').toLocaleLowerCase().includes(term))})).filter(g=>g.lines.length);
 return <section className={s.app}><header className={s.heading}><div><span className={s.kicker}>STOCK POR TÉCNICO</span><h1>Stock por técnico</h1><p className={s.note}>Lo que marcás como &quot;No incluido&quot; no se descarga en Intra: queda en el stock del técnico principal del formulario, que es quien lo compró.</p></div></header>
 <ZoneFilter state={zones}/><Feedback error={error||zones.error}/>
 <div className={s.toolbar}><label className={s.inline}>Técnico<select aria-label="Técnico" value={chosen} onChange={e=>setTechnician(e.target.value)}><option value="">Todos los técnicos de la zona</option>{roster.map(r=><option key={r.key} value={r.key}>{r.name}{r.group?' · '+r.group.lines.length:''}</option>)}</select></label><input aria-label="Buscar en el stock" placeholder="Buscar insumo, formulario o factura…" size={36} value={search} onChange={e=>setSearch(e.target.value)}/>{zones.data&&<a className={s.button} href={operationsUrl('stock',zones.projects,undefined,true)}>Descargar Excel</a>}</div>
 {!!roster.length&&<div className={s.techGrid}>{roster.map(r=><button key={r.key} type="button" aria-pressed={chosen===r.key} className={s.techCard+(r.group?'':' '+s.techEmpty)} onClick={()=>setTechnician(chosen===r.key?'':r.key)}><strong>{r.name}</strong><span>{r.group?r.group.lines.length+(r.group.lines.length===1?' línea en stock':' líneas en stock'):'Sin stock'}</span></button>)}</div>}
 {loading&&<p role="status">Consultando stock…</p>}
 {!loading&&!groups.length&&<p className={s.note}>{all.length?'No hay stock que coincida con el filtro.':'Todavía no hay insumos en stock. Aparecen cuando en "Revisar insumo" elegís "No incluido".'}</p>}
 {groups.map(g=><div className={s.card} key={g.technician}><h2>{g.technician} · {g.lines.length} {g.lines.length===1?'línea':'líneas'}</h2>
  <p className={s.note}>En total: {g.totals.map(t=>t.description+' ×'+t.quantity).join(' · ')}</p>
  <div className={s.tableWrap}><table className={s.compact}><thead><tr>{['Insumo','Cantidad','Formulario','Sitio','Zona','Fecha','Factura'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{g.lines.map(l=><tr key={l.key}><td><strong>{l.description||'Sin descripción'}</strong>{l.provider&&<small>{l.provider}</small>}</td><td className={s.nowrap}><strong>{l.quantity??'—'}</strong></td><td className={s.nowrap}>{l.link?<a href={l.link} target="_blank" rel="noopener noreferrer" title="Abrir en Sytex">{l.formulario} ↗</a>:l.formulario}</td><td>{l.siteCode}<small>{l.siteName}</small></td><td className={s.nowrap}>{projectLabel(l.review?.project??l.projects[0]??'')}</td><td className={s.nowrap}>{date(l.editedAt)}</td><td>{l.review?.invoiceNumber||'Sin factura'}</td></tr>)}</tbody></table></div></div>)}
 </section>;
}
