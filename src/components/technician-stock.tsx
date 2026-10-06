"use client";
import { useEffect,useMemo,useState } from 'react';
import type { Material } from '@/contracts/operations';
import { stockByTechnician } from '@/lib/supply-stock';
import { Feedback,opCall,operationsUrl,projectLabel,useCatalog,ZoneFilter } from './operations-common';
import s from './operations.module.css';
const date=(value:string|null|undefined)=>value?value.slice(0,10).split('-').reverse().join('/'):'—';
/** What was marked as not included stays with the main technician of the form, who bought it. */
export function TechnicianStock(){
 const zones=useCatalog(),[items,setItems]=useState<Material[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[search,setSearch]=useState('');
 const filter=zones.projects.join('|');
 useEffect(()=>{if(!zones.data)return;let active=true;const timer=setTimeout(()=>{setLoading(true);opCall<{items:Material[]}>(operationsUrl('materials',zones.projects)).then(d=>{if(active){setItems(d.items);setError('');}}).catch(e=>{if(active){setError(e.message);setItems([]);}}).finally(()=>{if(active)setLoading(false);});},0);return()=>{active=false;clearTimeout(timer);};},[filter,zones.data]); // eslint-disable-line react-hooks/exhaustive-deps
 const term=search.toLocaleLowerCase(),groups=useMemo(()=>stockByTechnician(items).map(g=>({...g,lines:g.lines.filter(l=>[l.description,l.formulario,l.siteCode,l.siteName,g.technician,l.review?.invoiceNumber].join(' ').toLocaleLowerCase().includes(term))})).filter(g=>g.lines.length),[items,term]);
 return <section className={s.app}><header className={s.heading}><div><span className={s.kicker}>STOCK DE TÉCNICOS</span><h1>Stock de técnicos</h1><p className={s.note}>Los insumos que marcaste como &quot;No incluido&quot; no se descargan en Intra: quedan acá, en el stock del técnico principal del formulario, que es quien los compró.</p></div></header>
 <ZoneFilter state={zones}/><Feedback error={error||zones.error}/>
 <div className={s.toolbar}><input aria-label="Buscar en el stock" placeholder="Buscar técnico, insumo, formulario o factura…" size={44} value={search} onChange={e=>setSearch(e.target.value)}/>{zones.data&&<a className={s.button} href={operationsUrl('stock',zones.projects,undefined,true)}>Descargar Excel</a>}</div>
 {loading&&<p role="status">Consultando stock…</p>}
 {!loading&&!groups.length&&<p className={s.note}>Todavía no hay insumos en stock. Aparecen cuando en &quot;Revisar insumo&quot; elegís &quot;No incluido&quot;.</p>}
 {groups.map(g=><div className={s.card} key={g.technician}><h2>{g.technician} · {g.lines.length} {g.lines.length===1?'línea':'líneas'}</h2>
  <p className={s.note}>En total: {g.totals.map(t=>t.description+' ×'+t.quantity).join(' · ')}</p>
  <div className={s.tableWrap}><table className={s.compact}><thead><tr>{['Insumo','Cantidad','Formulario','Sitio','Zona','Fecha','Factura'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{g.lines.map(l=><tr key={l.key}><td><strong>{l.description||'Sin descripción'}</strong>{l.provider&&<small>{l.provider}</small>}</td><td className={s.nowrap}><strong>{l.quantity??'—'}</strong></td><td className={s.nowrap}>{l.link?<a href={l.link} target="_blank" rel="noopener noreferrer" title="Abrir en Sytex">{l.formulario} ↗</a>:l.formulario}</td><td>{l.siteCode}<small>{l.siteName}</small></td><td className={s.nowrap}>{projectLabel(l.review?.project??l.projects[0]??'')}</td><td className={s.nowrap}>{date(l.editedAt)}</td><td>{l.review?.invoiceNumber||'Sin factura'}</td></tr>)}</tbody></table></div></div>)}
 </section>;
}
