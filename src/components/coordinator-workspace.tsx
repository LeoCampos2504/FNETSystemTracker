"use client";
import { useEffect,useState,type ReactNode } from 'react';
import type { GuardOverview } from '@/contracts/operations';
import { CticView } from './guard-duty';
import { opCall } from './operations-common';
/** A CTIC account gets its own read-only screen; every other coordination account gets the same app as the admin. */
export function CticGate({onLogout,children}:{onLogout:()=>void;children:ReactNode}){
 const [ctic,setCtic]=useState<boolean|null>(null);
 useEffect(()=>{let active=true;opCall<GuardOverview>('/api/operations/guard').then(o=>{if(active)setCtic(o.ctic);}).catch(()=>{if(active)setCtic(false);});return()=>{active=false;};},[]);
 if(ctic===null)return <main className="auth-loading">Cargando…</main>;
 return ctic?<CticView onLogout={onLogout}/>:<>{children}</>;
}
