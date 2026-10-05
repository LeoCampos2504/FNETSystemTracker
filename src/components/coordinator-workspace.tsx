"use client";
import { useState } from 'react';
import { DailySchedule } from './daily-schedule';
import { SytexSupplyControl } from './sytex-supply-control';
import s from './operations.module.css';
export function CoordinatorWorkspace({onLogout}:{onLogout:()=>void}){
 const [tab,setTab]=useState('schedule');
 return <main className={s.shell}><div className={s.app}><header className={s.heading}><strong>FNET TRACKER · Coordinación</strong><button onClick={async()=>{const r=await fetch('/api/auth/logout',{method:'POST'});if(r.ok)onLogout();}}>Cerrar sesión</button></header><nav className={s.tabs}><button aria-pressed={tab==='schedule'} onClick={()=>setTab('schedule')}>Cronograma</button><button aria-pressed={tab==='supplies'} onClick={()=>setTab('supplies')}>Insumos y control Intra</button></nav>{tab==='schedule'?<DailySchedule/>:<SytexSupplyControl/>}</div></main>;
}
