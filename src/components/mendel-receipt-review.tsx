"use client";

import { useState } from 'react';
import type { TrayRow } from '@/lib/mendel-bandeja';
import { zonePost } from './mendel-zone-actions';
import styles from './mendel-zone-tray.module.css';

export function MendelReceiptReview({ row, canReview, onSaved }: { row: TrayRow; canReview: boolean; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const check = row.receiptCheck;
  async function save(ok: boolean) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await zonePost({ action: 'receipt', transactionId: row.transactionId, ok, expectedEventId: check?.eventId ?? null,
        expectedSnapshotHash: row.snapshotHash, requestId: crypto.randomUUID() });
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se guardó la revisión.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.decisionPanel} aria-label="Revisión manual del comprobante">
    <h3>Control de comprobante</h3>
    <p className={styles.detailHint}>Si ya viste la foto o el PDF en Mendel, marcá OK aquí. No autoriza el gasto ni modifica Mendel o el CSV.</p>
    {check?.at && <p className={styles.detailHint}>{check.ok ? 'Marcado OK' : 'OK manual retirado'} por {check.actor} · {new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(check.at))} · Argentina</p>}
    {check?.needsReview && <p className={styles.reconfirmation}>Cambió la información del comprobante o del gasto. Revisalo antes de volver a confirmar.</p>}
    {canReview && row.revision && row.snapshotHash ? <div className={styles.actions}>
      {(!check?.ok || check.needsReview) && <button type="button" className={styles.primary} disabled={busy} onClick={() => void save(true)}>{busy ? 'Guardando…' : 'Marcar comprobante OK'}</button>}
      {check?.ok && <button type="button" disabled={busy} onClick={() => void save(false)}>Deshacer OK manual</button>}
    </div> : canReview ? <p className={styles.detailHint}>Primero compartí el gasto y abrilo desde el control compartido para guardar una revisión.</p> : null}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
