"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Material } from '@/contracts/operations';
import { SUPPLY_BATCH_LIMIT, supplyReviewInput, type SupplyChoice } from '@/lib/supply-review';
import { Feedback, opCall, useOperation } from './operations-common';
import s from './operations.module.css';

export function SupplyReviewChoices({ inclusion, onInclusion, downloaded, onDownloaded, disabled = false }: {
  inclusion: SupplyChoice; onInclusion: (value: SupplyChoice) => void; downloaded: boolean; onDownloaded: (value: boolean) => void; disabled?: boolean;
}) {
  return <div className={s.quickChoices}>
    <fieldset disabled={disabled}><legend>¿Es incluido?</legend><div>
      {([['INCLUIDO', 'Incluido'], ['NO_INCLUIDO', 'No incluido'], ['PENDIENTE', 'Sin definir']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={inclusion === value} onClick={() => onInclusion(value)}>{label}</button>)}
    </div></fieldset>
    {inclusion === 'INCLUIDO' && <fieldset disabled={disabled}><legend>¿Descargado en Intra?</legend><div>
      <button type="button" aria-pressed={downloaded} onClick={() => onDownloaded(true)}>Sí, descargado</button>
      <button type="button" aria-pressed={!downloaded} onClick={() => onDownloaded(false)}>No, pendiente</button>
    </div></fieldset>}
  </div>;
}

export function SupplyBatchReview({ items, onSaved, onCancel }: { items: Material[]; onSaved: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element=dialog.current; element?.showModal(); return()=>element?.close(); }, []);
  const op = useOperation(), [inclusion, setInclusion] = useState<SupplyChoice>('PENDIENTE');
  const [downloaded, setDownloaded] = useState(false), [invoice, setInvoice] = useState('');
  const [confirming, setConfirming] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    await op.run(async () => {
      const reviews = items.map(item => supplyReviewInput(item, inclusion, downloaded, invoice));
      if (!items.length || items.length > SUPPLY_BATCH_LIMIT) throw new Error('Seleccioná entre 1 y 50 insumos.');
      if (new TextEncoder().encode(JSON.stringify({action:'reviewBatch',reviews})).length > 65536) throw new Error('El lote supera el tamaño permitido. Seleccioná menos insumos; no se guardó ninguno.');
      if (!confirming) { setConfirming(true); return; }
      // Exactly one request/transaction. Never split into partially committed batches.
      await opCall('/api/operations', { action: 'reviewBatch', reviews });
      onSaved();
    });
  }
  return <dialog ref={dialog} className={s.dialog} aria-label="Control múltiple de insumos" onCancel={event=>{event.preventDefault();if(!op.busy)onCancel();}}><h2>Factura y control múltiple</h2><form className={s.reviewForm} onSubmit={submit}>
    <p className={s.note}>Una factura para {items.length} insumos. Se guardan todos juntos o ninguno. Este control no modifica el stock oficial de Intra.</p>
    <label>Número de factura compartida<input value={invoice} onChange={e => setInvoice(e.target.value)} maxLength={200} required={inclusion === 'INCLUIDO'} disabled={op.busy || confirming} placeholder="Ej.: 0001-00001234" /></label>
    <SupplyReviewChoices inclusion={inclusion} onInclusion={setInclusion} downloaded={downloaded} onDownloaded={setDownloaded} disabled={op.busy || confirming} />
    <div className={s.batchPreview}>{items.map(item => <div key={item.key}><strong>{item.description || 'Insumo sin descripción'}</strong><small>{item.formulario} · {item.siteCode} · cantidad {item.quantity ?? 'sin informar'} · factura actual: {item.review?.invoiceNumber || 'sin factura'}</small>{item.changed && <span className={s.warning}>Cambió en Sytex: verificá la cantidad antes de guardar.</span>}</div>)}</div>
    {confirming && <p className={s.warning} role="status">Vas a reemplazar la clasificación, factura y estado de {items.length} insumos por los elegidos arriba. Se conservan notas y archivos. Confirmá para guardar.</p>}
    <Feedback {...op} /><div className={s.actions}><button type="submit" className={s.primary} disabled={op.busy}>{op.busy ? 'Guardando…' : confirming ? `Confirmar guardado de ${items.length}` : `Revisar y guardar ${items.length} insumos`}</button>{confirming && <button type="button" disabled={op.busy} onClick={()=>setConfirming(false)}>Volver a editar</button>}<button type="button" disabled={op.busy} onClick={onCancel}>Cancelar</button></div>
    <small>Las notas y los comprobantes adjuntos existentes no se reemplazan. Para adjuntar un archivo, abrí el detalle individual.</small>
  </form></dialog>;
}
