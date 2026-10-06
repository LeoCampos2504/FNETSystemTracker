"use client";
import { useEffect,useState } from 'react';
import type { GuardOverview } from '@/contracts/operations';
import { CticView,GuardDuty } from './guard-duty';
import { opCall } from './operations-common';
import { DailySchedule } from './daily-schedule';
import { SytexSupplyControl } from './sytex-supply-control';
import { TechnicianStock } from './technician-stock';
import s from './operations.module.css';
export function CoordinatorWorkspace({onLogout}:{onLogout:()=>void}){
 const [tab,setTab]=useState('schedule');
 return <main className={s.shell}><div className={s.app}><header className={s.heading}><strong>FNET TRACKER · Coordinación</strong><button onClick={async()=>{const r=await fetch('/api/auth/logout',{method:'POST'});if(r.ok)onLogout();}}>Cerrar sesión</button></header><nav className={s.tabs}><button aria-pressed={tab==='schedule'} onClick={()=>setTab('schedule')}>Cronograma</button><button aria-pressed={tab==='supplies'} onClick={()=>setTab('supplies')}>Insumos y control Intra</button><button aria-pressed={tab==='stock'} onClick={()=>setTab('stock')}>Stock de técnicos</button><button aria-pressed={tab==='guards'} onClick={()=>setTab('guards')}>Guardias</button></nav>{tab==='schedule'?<DailySchedule/>:tab==='guards'?<GuardDuty/>:tab==='stock'?<TechnicianStock/>:<SytexSupplyControl/>}</div></main>;
}
/** A CTIC account gets its own read-only screen; every other coordination account gets the workspace. */
export function CoordinatorEntry({onLogout}:{onLogout:()=>void}){
 const [ctic,setCtic]=useState<boolean|null>(null);
 useEffect(()=>{let active=true;opCall<GuardOverview>('/api/operations/guard').then(o=>{if(active)setCtic(o.ctic);}).catch(()=>{if(active)setCtic(false);});return()=>{active=false;};},[]);
 if(ctic===null)return <main className="auth-loading">Cargando…</main>;
 return ctic?<CticView onLogout={onLogout}/>:<CoordinatorWorkspace onLogout={onLogout}/>;
}
