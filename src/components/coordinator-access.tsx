"use client";
import { useEffect,useState,type FormEvent } from 'react';
import Link from 'next/link';
import { Feedback,opCall,ProjectPicker,useCatalog,useOperation } from './operations-common';
import s from './operations.module.css';
type Coordinator={id:string;name:string;email:string;active:boolean;projects:string[]};
export function CoordinatorAccess(){
 const c=useCatalog(),op=useOperation(),[users,setUsers]=useState<Coordinator[]>([]),[revision,setRevision]=useState(0),[selected,setSelected]=useState<Coordinator|null>(null),[projects,setProjects]=useState<string[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;opCall<{users:Coordinator[]}>('/api/operations/access').then(r=>{if(active)setUsers(r.users);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[revision]);
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);await op.run(async()=>{await opCall('/api/operations/access',selected?{action:'grant',userId:selected.id,projects}:{action:'create',name:f.get('name'),email:f.get('email'),password:f.get('password'),projects});setSelected(null);setProjects([]);setRevision(v=>v+1);op.setSuccess('Cuenta y proyectos guardados.');});}
 return <section className={s.app}><Link href="/">← Volver a FNET</Link><h1>Cuentas de coordinadores</h1><p>Habilitá los proyectos de cada cuenta. Podés marcar todas las zonas y dejar que cada coordinador guarde su selección como favorito.</p><Feedback error={error||c.error}/><Feedback {...op}/>
 <div className={s.card}><h2>{selected?'Proyectos de '+selected.name:'Crear cuenta de coordinador'}</h2><form onSubmit={save}>{!selected&&<div className={s.fields}><label>Nombre<input name="name" required maxLength={200}/></label><label>Correo<input name="email" type="email" required maxLength={320}/></label><label>Contraseña inicial (mínimo 15 caracteres)<input name="password" type="password" required minLength={15} maxLength={72} autoComplete="new-password"/></label></div>}
 <div className={s.checks}><button type="button" onClick={()=>setProjects(c.data?.projects??[])}>Habilitar todos</button><button type="button" onClick={()=>setProjects([])}>Quitar selección</button></div>
 <ProjectPicker options={c.data?.projects??[]} selected={projects} onChange={setProjects} label="Agregar proyecto a la cuenta"/>
 <p className={s.note}>Una cuenta sin proyectos no accede a los datos operativos. El filtro favorito no amplía los permisos.</p><button className={s.primary} disabled={op.busy||!c.data?.admin||(!selected&&!projects.length)}>Guardar</button>{selected&&<button type="button" onClick={()=>{setSelected(null);setProjects([]);}}>Cancelar</button>}</form></div>
 {users.map(u=><div className={s.card} key={u.id}><strong>{u.name} · {u.email}</strong><p>{u.active?'Activa':'Inactiva'} · {u.projects.join(' / ')||'Sin proyectos habilitados'}</p><button onClick={()=>{setSelected(u);setProjects(u.projects);}}>Editar proyectos</button></div>)}</section>;
}
