'use client';

import { useState } from 'react';

export type PurchaseDetails = { fullId: string | null; sourceInvoice: string | null; sourceDescription: string | null; manualInvoice: string | null; oppen: boolean; requiresIntra: boolean | null; version: number };

export function MendelPurchaseDetails({ transactionId, value, onSaved }: { transactionId: string; value: PurchaseDetails; onSaved: (value: PurchaseDetails) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invoice, setInvoice] = useState(value.manualInvoice ?? value.sourceInvoice ?? '');
  const [history, setHistory] = useState<Array<{ actor: string | null; at: string; after: { oppen: boolean; requiresIntra: boolean | null; manualInvoice: string | null } }> | null>(null);
  async function loadHistory() {
    try {
      const response = await fetch('/api/mendel/purchase-details?transactionId=' + encodeURIComponent(transactionId), { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const result = await response.json() as { events: NonNullable<typeof history> };
      setHistory(result.events);
    } catch { setError('No se pudo cargar el historial.'); }
  }
  async function save(next: Pick<PurchaseDetails, 'oppen' | 'requiresIntra' | 'manualInvoice'>) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/mendel/purchase-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactionId, ...next, expectedVersion: value.version }) });
      if (!response.ok) { setError(response.status === 409 ? 'Otra persona modificó este control. Actualizá la página.' : 'No se pudo guardar.'); return; }
      const result = await response.json() as { state: Pick<PurchaseDetails, 'oppen' | 'requiresIntra' | 'manualInvoice' | 'version'> };
      onSaved({ ...value, ...result.state });
    } catch { setError('No se pudo conectar para guardar.'); }
    finally { setBusy(false); }
  }
  const current = { oppen: value.oppen, requiresIntra: value.requiresIntra, manualInvoice: value.manualInvoice };
  return <div>
    <button type="button" className="button secondary" disabled={busy} onClick={() => void save({ ...current, oppen: !value.oppen })}>Va en Oppen: {value.oppen ? 'Sí' : 'No'}</button>
    <label>Debe cargarse en Intra <select value={value.requiresIntra === null ? '' : String(value.requiresIntra)} disabled={busy} onChange={event => void save({ ...current, requiresIntra: event.target.value === '' ? null : event.target.value === 'true' })}><option value="">Sin confirmar</option><option value="true">Sí</option><option value="false">No</option></select></label>
    <label>Factura <input value={invoice} maxLength={200} disabled={busy} onChange={event => setInvoice(event.target.value)} /></label>
    <button type="button" className="button secondary" disabled={busy || invoice === (value.manualInvoice ?? value.sourceInvoice ?? '')} onClick={() => void save({ ...current, manualInvoice: invoice || null })}>Guardar factura</button>
    <button type="button" className="button secondary" onClick={() => { if (history) setHistory(null); else void loadHistory(); }}>Historial</button>
    {history && <div>{history.length === 0 ? 'Sin cambios registrados.' : history.map((event, index) => <p key={index}>{event.actor ?? 'Cuenta registrada'} · {new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(event.at))} · Oppen: {event.after.oppen ? 'Sí' : 'No'} · Debe cargarse: {event.after.requiresIntra === null ? 'Sin confirmar' : event.after.requiresIntra ? 'Sí' : 'No'} · Factura: {event.after.manualInvoice ?? 'Sin ajuste manual'}</p>)}</div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
