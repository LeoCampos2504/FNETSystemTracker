"use client";
import { useEffect,useState,type FormEvent } from 'react';
import Link from 'next/link';
import { Feedback,opCall,useOperation } from './operations-common';
import s from './operations.module.css';
type Coordinator={id:string;name:string;email:string;active:boolean;projects:string[]};
/** Coordination accounts see every zone; each person filters by zone and type inside the panels. */
export function CoordinatorAccess(){
 const op=useOperation(),[users,setUsers]=useState<Coordinator[]>([]),[revision,setRevision]=useState(0),[error,setError]=useState('');
 useEffect(()=>{let active=true;opCall<{users:Coordinator[]}>('/api/operations/access').then(r=>{if(active)setUsers(r.users);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[revision]);
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,f=new FormData(form);await op.run(async()=>{await opCall('/api/operations/access',{action:'create',name:f.get('name'),email:f.get('email'),password:f.get('password'),projects:[]});form.reset();setRevision(v=>v+1);op.setSuccess('Cuenta creada. Ya puede ingresar y ver todas las zonas.');});}
 const unlimit=(user:Coordinator)=>op.run(async()=>{await opCall('/api/operations/access',{action:'grant',userId:user.id,projects:[]});setRevision(v=>v+1);op.setSuccess('La cuenta ahora ve todas las zonas.');});
 return <section className={s.app}><Link href="/">← Volver a FNET</Link><h1>Cuentas de coordinación</h1><p className={s.note}>Cada cuenta ve todas las zonas y filtra por zona y tipo dentro de los paneles. Pueden compartir una sola cuenta o tener una por persona.</p><Feedback error={error}/><Feedback {...op}/>
 <div className={s.card}><h2>Crear cuenta</h2><form onSubmit={save}><div className={s.fields}><label>Nombre<input name="name" required maxLength={200}/></label><label>Correo<input name="email" type="email" required maxLength={320}/></label><label>Contraseña inicial (mínimo 15 caracteres)<input name="password" type="password" required minLength={15} maxLength={72} autoComplete="new-password"/></label></div><button className={s.primary} disabled={op.busy}>Crear cuenta</button></form></div>
 {users.map(u=><div className={s.card} key={u.id}><strong>{u.name} · {u.email}</strong><p>{u.active?'Activa':'Inactiva'} · {u.projects.length?'Limitada a: '+u.projects.join(' / '):'Ve todas las zonas'}</p>{u.projects.length>0&&<button disabled={op.busy} onClick={()=>void unlimit(u)}>Habilitar todas las zonas</button>}</div>)}</section>;
}
