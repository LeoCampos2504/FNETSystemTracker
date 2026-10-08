"use client";
import { useEffect,useMemo,useState } from 'react';
import type { Material } from '@/contracts/operations';
import { fold,stockByTechnician } from '@/lib/supply-stock';
import { selectedZones } from '@/lib/filters';
import { Feedback,opCall,operationsUrl,projectLabel,projectZone,useCatalog,useZoneSelection,ZoneFilter } from './operations-common';
import s from './operations.module.css';
const date=(value:string|null|undefined)=>value?value.slice(0,10).split('-').reverse().join('/'):'—';
/** What was marked as not included stays with the main technician of the form, who bought it. */
export function TechnicianStock(){
 const zones=useCatalog(),[items,setItems]=useState<Material[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[search,setSearch]=useState(''),[open,setOpen]=useState('');
 const filter=zones.projects.join('|');
 useEffect(()=>{if(!zones.data)return;let active=true;const timer=setTimeout(()=>{setLoading(true);opCall<{items:Material[]}>(operationsUrl('materials',zones.projects)).then(d=>{if(active){setItems(d.items);setError('');}}).catch(e=>{if(active){setError(e.message);setItems([]);}}).finally(()=>{if(active)setLoading(false);});},0);return()=>{active=false;clearTimeout(timer);};},[filter,zones.data]); // eslint-disable-line react-hooks/exhaustive-deps
 const all=useMemo(()=>stockByTechnician(items),[items]),picked=selectedZones(useZoneSelection().places),zone=picked.size>0;
 // A technician belongs to the zone where he is assigned most often: they always work in the same one.
 const roster=useMemo(()=>{const seen=new Map<string,{name:string;zones:Map<string,number>}>();
  const add=(name:string,z:string)=>{const key=fold(name);if(!key)return;const e=seen.get(key)??{name,zones:new Map<string,number>()};e.zones.set(z,(e.zones.get(z)??0)+1);seen.set(key,e);};
  // The technicians of a form are its assigned user and its collaborator. Task exports (TA-) list everyone involved, reviewer and requester included, so only forms count.
  for(const t of zones.data?.tasks??[])if(/^FO-/i.test(t.code))for(const name of t.technicians.flatMap(n=>n.split(/\s*[/;]\s*/)))add(name.trim(),projectZone(t.project).zone);
  for(const g of all)add(g.technician,projectZone(g.lines[0].review?.project??g.lines[0].projects[0]??'').zone);
  return [...seen.entries()].map(([key,e])=>({key,name:e.name,zone:[...e.zones.entries()].sort((a,b)=>b[1]-a[1])[0][0],group:all.find(g=>fold(g.technician)===key)})).sort((a,b)=>(a.group?0:1)-(b.group?0:1)||a.name.localeCompare(b.name,'es'));},[zones.data,all]);
 // With a zone chosen, every technician of that zone shows up; without one, only those who hold stock.
 const term=search.toLocaleLowerCase(),cards=roster.filter(r=>(zone?picked.has(r.zone):!!r.group)&&(!term||r.name.toLocaleLowerCase().includes(term)||r.group?.lines.some(l=>[l.description,l.formulario,l.siteCode,l.siteName,l.review?.invoiceNumber].join(' ').toLocaleLowerCase().includes(term)))),detail=roster.find(r=>r.key===open);
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen('');};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[open]);
 return <section className={s.app}><header className={s.heading}><div><span className={s.kicker}>Lo que cada técnico tiene comprado y sin descargar</span><h1>Stock por técnico</h1><p className={s.note}>Lo que marcás como &quot;No incluido&quot; no se descarga en Intra: queda en el stock del técnico principal del formulario, que es quien lo compró.</p></div></header>
 <ZoneFilter state={zones}/><Feedback error={error||zones.error}/>
 <div className={s.toolbar}><input aria-label="Buscar en el stock" placeholder="Buscar técnico, insumo, formulario o factura…" size={44} value={search} onChange={e=>setSearch(e.target.value)}/>{zones.data&&<a className={s.button} href={operationsUrl('stock',zones.projects,undefined,true)}>Descargar Excel</a>}</div>
 {loading&&<p role="status">Consultando stock…</p>}
 {!zone&&!loading&&<p className={s.note}>Elegí una zona para ver todos sus técnicos. Abajo se muestran los técnicos que tienen stock.</p>}
 {!loading&&!cards.length&&<p className={s.note}>{zone?'No hay técnicos de esa zona que coincidan con la búsqueda.':'Todavía no hay insumos en stock. Aparecen cuando en "Revisar insumo" elegís "No incluido".'}</p>}
 <div className={s.techGrid}>{cards.map(r=><button key={r.key} type="button" aria-haspopup="dialog" className={s.techCard+(r.group?'':' '+s.techEmpty)} onClick={()=>setOpen(r.key)}><strong>{r.name}</strong><span>{r.group?r.group.lines.length+(r.group.lines.length===1?' línea en stock':' líneas en stock'):'Sin stock'}{!zone&&' · '+(r.zone||'Sin zona')}</span>{r.group&&<small>{r.group.totals.slice(0,3).map(t=>t.description+' ×'+t.quantity).join(' · ')}</small>}</button>)}</div>
 {detail&&<div className={s.overlay} onClick={()=>setOpen('')}><section className={s.dialog+' '+s.stockDialog} role="dialog" aria-modal="true" aria-label={'Stock de '+detail.name} onClick={e=>e.stopPropagation()}><div className={s.heading}><div><h2>{detail.name}</h2><p className={s.note}>{detail.zone||'Sin zona'}{detail.group?' · '+detail.group.lines.length+(detail.group.lines.length===1?' línea':' líneas'):''}</p></div><button onClick={()=>setOpen('')}>Cerrar ✕</button></div>
  {!detail.group?<p className={s.note}>No tiene insumos en stock.</p>:<><div className={s.totals}>{detail.group.totals.map(t=><span key={t.description}>{t.description} <strong>×{t.quantity}</strong></span>)}</div>
  <div className={s.tableWrap}><table className={s.compact}><thead><tr>{['Insumo','Cantidad','Formulario','Sitio','Zona','Fecha','Factura'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{detail.group.lines.map(l=><tr key={l.key}><td><strong>{l.description||'Sin descripción'}</strong>{l.provider&&<small>{l.provider}</small>}</td><td className={s.nowrap}><strong>{l.quantity??'—'}</strong></td><td className={s.nowrap}>{l.link?<a href={l.link} target="_blank" rel="noopener noreferrer" title="Abrir en Sytex">{l.formulario} ↗</a>:l.formulario}</td><td>{l.siteCode}<small>{l.siteName}</small></td><td className={s.nowrap}>{projectLabel(l.review?.project??l.projects[0]??'')}</td><td className={s.nowrap}>{date(l.editedAt)}</td><td>{l.review?.invoiceNumber||'Sin factura'}</td></tr>)}</tbody></table></div></>}</section></div>}
 </section>;
}
