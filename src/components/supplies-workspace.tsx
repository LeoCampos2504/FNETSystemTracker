"use client";
import { useState } from 'react';
import { SytexSupplyControl } from './sytex-supply-control';
import { TechnicianStock } from './technician-stock';
import s from './operations.module.css';
/** Insumos has two parts: the control of what Sytex reports, and the stock each technician keeps. */
export function SuppliesWorkspace(){
 const [tab,setTab]=useState<'control'|'stock'>('control');
 return <><div className={s.app}><nav className={s.tabs} aria-label="Secciones de Insumos"><button aria-pressed={tab==='control'} onClick={()=>setTab('control')}>Control de insumos</button><button aria-pressed={tab==='stock'} onClick={()=>setTab('stock')}>Stock por técnico</button></nav></div>{tab==='control'?<SytexSupplyControl/>:<TechnicianStock/>}</>;
}
