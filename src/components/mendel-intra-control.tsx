"use client";

import { useRef, useState, type FormEvent } from 'react';
import { Check, Pencil } from 'lucide-react';
import { intraConfirmationLabel, type MendelIntraHistoryEntry, type MendelIntraState } from '@/lib/mendel-intra';
import { formatOperationalDateTime } from '@/lib/operational-timezone';
import { notifySessionExpired } from './operations-common';
import s from './mendel-intra-control.module.css';

const messages:Record<string,string>={
  UNAUTHENTICATED:'Tu sesión venció. Volvé a ingresar.',FORBIDDEN:'Solo Admin puede actualizar este control.',
  INTRA_STATE_CHANGED:'Otra persona actualizó este gasto. Actualizá el registro antes de confirmar.',
  MENDEL_PURCHASE_CHANGED:'Cambió la compra desde que la abriste. Actualizá y revisá los datos.',
  REQUEST_KEY_REUSED:'La solicitud anterior ya se procesó con otros datos. Actualizá antes de volver a guardar.',
  INPUT_INVALID:'Revisá las dos confirmaciones antes de guardar.',NOT_FOUND:'La compra ya no está disponible.',
};
const fieldValue=(v:boolean|null)=>v===null?'':String(v);
const flag=(v:string)=>v===''?null:v==='true';
async function json<T>(response:Response):Promise<T>{
  if(response.status===401)notifySessionExpired();
  const result=await response.json();
  if(!response.ok)throw new Error(messages[result.code]??'No se pudo confirmar la operación. No se informó un guardado exitoso; actualizá antes de reintentar.');
  return result;
}
function Confirmation({label,value}:{label:string;value:boolean|null}){
  return <div className={s.line}><span>{label}</span><strong className={value===true?s.yes:value===false?s.no:s.pending}>{intraConfirmationLabel(value)}</strong></div>;
}
export function MendelIntraControl({transactionId,state,onSaved}:{transactionId:string;state:MendelIntraState;onSaved:(next:MendelIntraState)=>void}){
  const [editing,setEditing]=useState(false),[uploaded,setUploaded]=useState(''),[downloaded,setDownloaded]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const [historyOpen,setHistoryOpen]=useState(false),[history,setHistory]=useState<MendelIntraHistoryEntry[]|null>(null),[historyError,setHistoryError]=useState(''),[historyBusy,setHistoryBusy]=useState(false);
  const requestId=useRef(''),expected=useRef({eventId:state.eventId,sourceHash:state.sourceHash}),locked=useRef(false);
  const open=()=>{setUploaded(fieldValue(state.uploaded));setDownloaded(fieldValue(state.downloaded));expected.current={eventId:state.eventId,sourceHash:state.sourceHash};requestId.current=crypto.randomUUID();setError('');setSuccess('');setEditing(true);};
  const loadHistory=async()=>{
    setHistoryBusy(true);setHistoryError('');
    try{const result=await json<{history:MendelIntraHistoryEntry[]}>(await fetch('/api/mendel/intra-control?transactionId='+encodeURIComponent(transactionId),{cache:'no-store'}));setHistory(result.history);}
    catch(e){setHistoryError(e instanceof Error?e.message:'No se pudo consultar el historial.');}
    finally{setHistoryBusy(false);}
  };
  const save=(e:FormEvent)=>{e.preventDefault();if(locked.current)return;locked.current=true;setBusy(true);setError('');setSuccess('');void(async()=>{
    try{
      const result=await json<{state:MendelIntraState}>(await fetch('/api/mendel/intra-control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transactionId,uploaded:flag(uploaded),downloaded:flag(downloaded),expectedEventId:expected.current.eventId,sourceHash:expected.current.sourceHash,requestId:requestId.current})}));
      onSaved(result.state);setEditing(false);setHistory(null);setHistoryOpen(false);setSuccess('Guardado en FNET.');
    }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}
    finally{locked.current=false;setBusy(false);}
  })();};
  const unchanged=uploaded===fieldValue(state.uploaded)&&downloaded===fieldValue(state.downloaded)&&!state.needsReview;
  return <div className={s.control} aria-label={'Control manual de Intra para '+transactionId}>
    <Confirmation label="Subido a Intra" value={state.uploaded}/><Confirmation label="Descargado en Intra" value={state.downloaded}/>
    {state.needsReview&&<p className={s.warning}>La compra cambió: revisá estas confirmaciones.</p>}
    {state.updatedAt&&<small className={s.author}>{state.updatedBy||'Cuenta registrada'} · {formatOperationalDateTime(state.updatedAt)} · Argentina</small>}
    {!editing?<button type="button" className={s.edit} onClick={open}><Pencil size={12}/>Editar control</button>:<form className={s.form} onSubmit={save}>
      <div className={s.fields}>{[['Subido a Intra',uploaded,setUploaded],['Descargado en Intra',downloaded,setDownloaded]].map(([label,value,setter])=><label key={String(label)}>{label as string}<select aria-label={String(label)} disabled={busy} value={value as string} onChange={e=>(setter as (s:string)=>void)(e.target.value)}><option value="">Sin confirmar</option><option value="true">Sí</option><option value="false">No</option></select></label>)}</div>
      <p className={s.hint}>Confirmación manual. No carga archivos ni mueve stock en Intra.</p>
      <div className={s.actions}><button type="submit" className={s.save} disabled={busy||unchanged}><Check size={13}/>{busy?'Guardando…':'Guardar control'}</button><button type="button" className={s.edit} disabled={busy} onClick={()=>{setEditing(false);setError('');}}>Cancelar</button></div>
    </form>}
    {error&&<p className={s.error} role="alert">{error}</p>}{success&&<p className={s.success} role="status">{success}</p>}
    {state.eventId&&<button type="button" className={s.historyToggle} aria-expanded={historyOpen} onClick={()=>{const next=!historyOpen;setHistoryOpen(next);if(next&&history===null&&!historyBusy)void loadHistory();}}>Historial</button>}
    {historyOpen&&<div className={s.history}>{historyBusy?<p role="status">Consultando historial…</p>:historyError?<><p role="alert" className={s.error}>{historyError}</p><button type="button" onClick={()=>void loadHistory()}>Reintentar consulta</button></>:history?.length?<><small>Últimas {history.length} confirmaciones (máximo 100).</small>{history.map(h=><article key={h.id}><strong>{h.actor}</strong><small>{formatOperationalDateTime(h.recordedAt)} · Argentina</small><span>Subido: {intraConfirmationLabel(h.uploaded)} · Descargado: {intraConfirmationLabel(h.downloaded)}</span></article>)}</>:<p>Sin confirmaciones registradas.</p>}</div>}
  </div>;
}
