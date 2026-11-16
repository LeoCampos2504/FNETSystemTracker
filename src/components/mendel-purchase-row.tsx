'use client';

import { useRef, useState } from 'react';
import type { MendelIntraState } from '@/lib/mendel-intra';
import type { PurchaseDetails } from './mendel-purchase-details';
import s from './mendel-purchase-control.module.css';

export type PurchaseRow = { transactionId: string; date: string; zone: string; userName: string | null; merchant: string | null; totalAmount: string; currency: string; budget: string | null; transactionCategory: string | null; transactionType: string | null; transactionStatus: string | null; details: PurchaseDetails; intra: MendelIntraState };
type Flags = Pick<PurchaseDetails, 'oppen' | 'requiresIntra' | 'manualInvoice'> & { observation: string };

function Toggle({ label, value, busy, onClick }: { label: string; value: boolean | null; busy: boolean; onClick: () => void }) {
  return <span className={s.toggleWrap}><button type="button" className={`${s.toggle} ${value === true ? s.yes : value === false ? s.no : s.pending}`} disabled={busy} onClick={onClick} aria-label={`${label}: ${value === true ? 'Sí' : 'No'}${value === null ? ', sin confirmar' : ''}`} aria-pressed={value === true}>{value === true ? 'Sí' : 'No'}</button>{value === null && <small className={s.pendingHint}>Sin confirmar</small>}</span>;
}

export function MendelPurchaseRow({ item, onSaved }: { item: PurchaseRow; onSaved: (item: PurchaseRow) => void }) {
  const [details, setDetails] = useState(item.details), [intra, setIntra] = useState(item.intra);
  const [invoice, setInvoice] = useState(item.details.manualInvoice ?? item.details.sourceInvoice ?? '');
  const [observation, setObservation] = useState(item.details.observation ?? '');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [loginNeeded, setLoginNeeded] = useState(false);
  const locked = useRef(false);

  async function saveDetails(next: Flags) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setLoginNeeded(false);
    const previous = details, previousInvoice = details.manualInvoice ?? details.sourceInvoice ?? '';
    setDetails({ ...details, ...next });
    try {
      const response = await fetch('/api/mendel/purchase-details', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ transactionId:item.transactionId, ...next, expectedVersion:details.version }) });
      if (!response.ok) {
        if (response.status === 401) { setLoginNeeded(true); throw new Error('Tu sesión venció. La modificación no se guardó; ingresá de nuevo y volvé a intentarlo.'); }
        if (response.status === 403) throw new Error('Tu cuenta no tiene permiso para modificar esta compra. No se guardó el cambio.');
        throw new Error(response.status === 409 ? 'Otra persona modificó esta compra. Actualizá la página.' : 'No se pudo guardar. Revisá la conexión e intentá nuevamente.');
      }
      const result = await response.json() as { state: Flags & { version:number } };
      const saved = { ...details, ...result.state }; setDetails(saved); setInvoice(saved.manualInvoice ?? saved.sourceInvoice ?? ''); setObservation(saved.observation ?? ''); onSaved({ ...item, details:saved, intra });
    } catch (e) { setDetails(previous); setInvoice(next.manualInvoice !== details.manualInvoice ? (next.manualInvoice ?? '') : previousInvoice); setObservation(next.observation); setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function toggleIntra(field: 'uploaded' | 'downloaded') {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setLoginNeeded(false);
    const previous = intra, next = { ...intra, [field]: intra[field] !== true }; setIntra(next);
    try {
      const response = await fetch('/api/mendel/intra-control', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({transactionId:item.transactionId, uploaded:next.uploaded, downloaded:next.downloaded, expectedEventId:intra.eventId, sourceHash:intra.sourceHash, requestId:crypto.randomUUID()}) });
      if (!response.ok) {
        if (response.status === 401) { setLoginNeeded(true); throw new Error('Tu sesión venció. La modificación no se guardó; ingresá de nuevo y volvé a intentarlo.'); }
        if (response.status === 403) throw new Error('Tu cuenta no tiene permiso para modificar esta compra. No se guardó el cambio.');
        throw new Error(response.status === 409 ? 'La compra cambió. Actualizá la página.' : 'No se pudo guardar; se conservó el valor anterior.');
      }
      const result = await response.json() as { state:MendelIntraState }; setIntra(result.state); onSaved({ ...item, details, intra:result.state });
    } catch (e) { setIntra(previous); setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { locked.current = false; setBusy(false); }
  }
  const current = { oppen:details.oppen, requiresIntra:details.requiresIntra, manualInvoice:details.manualInvoice, observation:details.observation ?? '' };
  const invoiceBefore = details.manualInvoice ?? details.sourceInvoice ?? '';
  return <tr>
    <td>{item.date}<small>{item.zone || 'Sin zona'}</small></td>
    <td><strong>{item.merchant || 'Sin proveedor'}</strong><small>{item.userName} · {item.budget}</small><small>{item.details.sourceDescription ?? item.transactionCategory ?? item.transactionType ?? 'Sin descripción'}</small><small>{item.currency} {item.totalAmount}</small></td>
    <td className={s.id}>{details.fullId ?? `${item.transactionId} (abreviado)`}</td>
    <td><Toggle label={`Va en Oppen ${item.transactionId}`} value={details.oppen} busy={busy} onClick={() => void saveDetails({...current, oppen:!details.oppen})}/></td>
    <td><input className={s.invoice} aria-label={`Número de factura ${item.transactionId}`} placeholder="Agregar factura" value={invoice} maxLength={200} disabled={busy} onChange={e => setInvoice(e.target.value)} onBlur={() => { if (invoice.trim() !== invoiceBefore) void saveDetails({...current, manualInvoice:invoice.trim() || null}); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/></td>
    <td><Toggle label={`Debe cargar en Intra ${item.transactionId}`} value={details.requiresIntra} busy={busy} onClick={() => void saveDetails({...current, requiresIntra:details.requiresIntra !== true})}/></td>
    <td><Toggle label={`Cargada en Intra ${item.transactionId}`} value={intra.uploaded} busy={busy} onClick={() => void toggleIntra('uploaded')}/></td>
    <td><Toggle label={`Descargada en Intra ${item.transactionId}`} value={intra.downloaded} busy={busy} onClick={() => void toggleIntra('downloaded')}/></td>
    <td><textarea className={s.observation} aria-label={`Observaciones ${item.transactionId}`} placeholder="Agregar observación" title={observation} value={observation} rows={2} maxLength={5000} disabled={busy} onChange={e => setObservation(e.target.value)} onBlur={() => { if (observation !== (details.observation ?? '')) void saveDetails({...current, observation}); }} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.blur(); } }}/></td>
    <td className={s.rowStatus}>{busy && <span role="status">Guardando…</span>}{error && <span role="alert">{error}{loginNeeded && <> <a href="/" target="_blank" rel="noopener noreferrer">Ingresar de nuevo</a></>}</span>}{!busy && !error && intra.needsReview && <span>Compra modificada: revisar Intra</span>}{!busy && !error && intra.uploaded !== null && intra.downloaded !== null && intra.uploaded !== intra.downloaded && <span>Carga y descarga diferentes</span>}</td>
  </tr>;
}
