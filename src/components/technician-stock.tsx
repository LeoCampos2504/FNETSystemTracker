"use client";
import { useEffect,useMemo,useState } from 'react';
import type { Material } from '@/contracts/operations';
import { fold,stockByTechnician } from '@/lib/supply-stock';
import { Feedback,opCall,operationsUrl,projectLabel,projectZone,useCatalog,useZoneSelection,ZoneFilter } from './operations-common';
import s from './operations.module.css';
const date=(value:string|null|undefined)=>value?value.slice(0,10).split('-').reverse().join('/'):'—';
/** What was marked as not included stays with the main technician of the form, who bought it. */
export function TechnicianStock(){
 const zones=useCatalog(),[items,setItems]=useState<Material[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[search,setSearch]=useState(''),[technician,setTechnician]=useState('');
 const filter=zones.projects.join('|');
 useEffect(()=>{if(!zones.data)return;let active=true;const timer=setTimeout(()=>{setLoading(true);opCall<{items:Material[]}>(operationsUrl('materials',zones.projects)).then(d=>{if(active){setItems(d.items);setError('');}}).catch(e=>{if(active){setError(e.message);setItems([]);}}).finally(()=>{if(active)setLoading(false);});},0);return()=>{active=false;clearTimeout(timer);};},[filter,zones.data]); // eslint-disable-line react-hooks/exhaustive-deps
 const all=useMemo(()=>stockByTechnician(items),[items]),zone=useZoneSelection().zone;
 // A technician belongs to the zone where he is assigned most often: they always work in the same one.
 const roster=useMemo(()=>{const seen=new Map<string,{name:string;zones:Map<string,number>}>();
  const add=(name:string,z:string)=>{const key=fold(name);if(!key)return;const e=seen.get(key)??{name,zones:new Map<string,number>()};e.zones.set(z,(e.zones.get(z)??0)+1);seen.set(key,e);};
  for(const t of zones.data?.tasks??[])for(const name of t.technicians)add(name,projectZone(t.project).zone);
  for(const g of all)add(g.technician,projectZone(g.lines[0].review?.project??g.lines[0].projects[0]??'').zone);
  return [...seen.entries()].map(([key,e])=>({key,name:e.name,zone:[...e.zones.entries()].sort((a,b)=>b[1]-a[1])[0][0],group:all.find(g=>fold(g.technician)===key)})).sort((a,b)=>a.name.localeCompare(b.name,'es'));},[zones.data,all]);
 const inZone=roster.filter(r=>!zone||r.zone===zone),zoneNames=[...new Set(inZone.map(r=>r.zone))].sort((a,b)=>a.localeCompare(b,'es'));
 const chosen=inZone.find(r=>r.key===technician),visible=new Set(inZone.map(r=>r.key));
 const term=search.toLocaleLowerCase(),groups=all.filter(g=>visible.has(fold(g.technician))&&(!chosen||fold(g.technician)===chosen.key)).map(g=>({...g,lines:g.lines.filter(l=>[l.description,l.formulario,l.siteCode,l.siteName,g.technician,l.review?.invoiceNumber].join(' ').toLocaleLowerCase().includes(term))})).filter(g=>g.lines.length);
 const withStock=inZone.filter(r=>r.group);
 return <section className={s.app}><header className={s.heading}><div><span className={s.kicker}>STOCK POR TÉCNICO</span><h1>Stock por técnico</h1><p className={s.note}>Lo que marcás como &quot;No incluido&quot; no se descarga en Intra: queda en el stock del técnico principal del formulario, que es quien lo compró.</p></div></header>
 <ZoneFilter state={zones}/><Feedback error={error||zones.error}/>
 <div className={s.toolbar}><label className={s.inline}>Técnico<select aria-label="Técnico" value={chosen?.key??''} onChange={e=>setTechnician(e.target.value)}><option value="">{zone?'Todos los técnicos de '+zone:'Todos los técnicos'}</option>{zoneNames.map(z=><optgroup key={z} label={z||'Sin zona'}>{inZone.filter(r=>r.zone===z).map(r=><option key={r.key} value={r.key}>{r.name}{r.group?' · '+r.group.lines.length+' en stock':''}</option>)}</optgroup>)}</select></label><input aria-label="Buscar en el stock" placeholder="Buscar insumo, formulario o factura…" size={36} value={search} onChange={e=>setSearch(e.target.value)}/>{zones.data&&<a className={s.button} href={operationsUrl('stock',zones.projects,undefined,true)}>Descargar Excel</a>}</div>
 {!!withStock.length&&<><p className={s.note}>Técnicos con stock{zone?' en '+zone:''}: tocá uno para ver qué tiene.</p><div className={s.techGrid}>{withStock.map(r=><button key={r.key} type="button" aria-pressed={chosen?.key===r.key} className={s.techCard} onClick={()=>setTechnician(chosen?.key===r.key?'':r.key)}><strong>{r.name}</strong><span>{r.group!.lines.length}{r.group!.lines.length===1?' línea':' líneas'} · {r.zone||'Sin zona'}</span><small>{r.group!.totals.slice(0,3).map(t=>t.description+' ×'+t.quantity).join(' · ')}</small></button>)}</div></>}
 {chosen&&!chosen.group&&!loading&&<p className={s.note}><strong>{chosen.name}</strong> no tiene insumos en stock.</p>}
 {loading&&<p role="status">Consultando stock…</p>}
 {!loading&&!groups.length&&!(chosen&&!chosen.group)&&<p className={s.note}>{all.length?'No hay stock que coincida con el filtro.':'Todavía no hay insumos en stock. Aparecen cuando en "Revisar insumo" elegís "No incluido".'}</p>}
 {groups.map(g=><div className={s.card} key={g.technician}><h2>{g.technician} · {g.lines.length} {g.lines.length===1?'línea':'líneas'}</h2>
  <div className={s.totals}>{g.totals.map(t=><span key={t.description}>{t.description} <strong>×{t.quantity}</strong></span>)}</div>
  <div className={s.tableWrap}><table className={s.compact}><thead><tr>{['Insumo','Cantidad','Formulario','Sitio','Zona','Fecha','Factura'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{g.lines.map(l=><tr key={l.key}><td><strong>{l.description||'Sin descripción'}</strong>{l.provider&&<small>{l.provider}</small>}</td><td className={s.nowrap}><strong>{l.quantity??'—'}</strong></td><td className={s.nowrap}>{l.link?<a href={l.link} target="_blank" rel="noopener noreferrer" title="Abrir en Sytex">{l.formulario} ↗</a>:l.formulario}</td><td>{l.siteCode}<small>{l.siteName}</small></td><td className={s.nowrap}>{projectLabel(l.review?.project??l.projects[0]??'')}</td><td className={s.nowrap}>{date(l.editedAt)}</td><td>{l.review?.invoiceNumber||'Sin factura'}</td></tr>)}</tbody></table></div></div>)}
 </section>;
}
