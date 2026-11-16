'use client';

import { useState } from 'react';

type Side = { transactionDate: string; merchant: string | null; totalAmount: string; currency: string; invoice: string | null };
type Candidate = { historical: Side & { transactionId: string }; csv: Side & { fullId: string } };
const showDate = (value: string) => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value));
const showMoney = (value: string, currency: string) => `${currency} ${Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function MendelIdentityReview({ onAssociated }: { onAssociated: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function compare() {
    if (!file) return;
    setBusy(true); setMessage(''); setItems(null); setConfirming(null);
    try {
      const form = new FormData(); form.set('file', file);
      const response = await fetch('/api/mendel/identity-review', { method: 'POST', body: form });
      if (!response.ok) throw new Error('No se pudo revisar el archivo. Verificá que sea un CSV de Mendel con ID completo.');
      const result = await response.json() as { candidates: Candidate[]; invalidRows: number };
      setItems(result.candidates);
      if (result.invalidRows) setMessage(`Hay ${result.invalidRows} filas inválidas que no se pudieron comparar.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo revisar el archivo.'); }
    finally { setBusy(false); }
  }
  async function associate(item: Candidate) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/mendel/identity-review', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shortId: item.historical.transactionId, fullId: item.csv.fullId }) });
      if (!response.ok) {
        const result = await response.json() as { code?: string };
        throw new Error(response.status === 409 ? 'No se guardó: el ID completo o la compra ya están asociados. Revisá los registros antes de continuar.' : `No se pudo guardar la asociación (${result.code ?? response.status}).`);
      }
      const result = await response.json() as { createdAt: string };
      setItems(previous => previous?.filter(candidate => candidate.historical.transactionId !== item.historical.transactionId) ?? null);
      setConfirming(null); setMessage(`Asociación guardada el ${new Date(result.createdAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}. Volvé a importar el CSV para actualizar los datos de Mendel.`);
      onAssociated();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }

  return <section className="mendel-import-card" aria-label="Revisión de ID históricos">
    <h2>Revisar compras con ID abreviado</h2>
    <p>Compará el registro histórico con el CSV de Mendel. Una coincidencia de ID no confirma que sean la misma compra.</p>
    {!open ? <button className="button secondary" type="button" onClick={() => setOpen(true)}>Revisar asociaciones</button> : <>
      <label>CSV de Mendel para comparar <input type="file" accept=".csv,text/csv" onChange={e => { setFile(e.target.files?.[0] ?? null); setItems(null); setMessage(''); setConfirming(null); }} /></label>{' '}
      <button className="button secondary" type="button" disabled={!file || busy} onClick={() => void compare()}>{busy ? 'Revisando…' : 'Comparar compras'}</button>
      {items && <p>{items.length ? `${items.length} ${items.length === 1 ? 'comparación' : 'comparaciones'} para revisar` : 'No hay compras históricas pendientes que coincidan con este archivo.'}</p>}
      {items?.map(item => <article key={`${item.historical.transactionId}:${item.csv.fullId}`} style={{ border: '1px solid #d8e2f1', borderRadius: 12, padding: 16, margin: '12px 0' }}>
        <div className="mendel-table-wrap"><table><thead><tr><th>Origen</th><th>ID</th><th>Fecha</th><th>Proveedor</th><th>Importe</th><th>Factura</th></tr></thead><tbody>
          <tr><td>Histórico</td><td>{item.historical.transactionId} (abreviado)</td><td>{showDate(item.historical.transactionDate)}</td><td>{item.historical.merchant ?? 'Sin dato'}</td><td>{showMoney(item.historical.totalAmount, item.historical.currency)}</td><td>{item.historical.invoice ?? 'Sin dato'}</td></tr>
          <tr><td>CSV Mendel</td><td>{item.csv.fullId} (completo)</td><td>{showDate(item.csv.transactionDate)}</td><td>{item.csv.merchant ?? 'Sin dato'}</td><td>{showMoney(item.csv.totalAmount, item.csv.currency)}</td><td>{item.csv.invoice ?? 'Sin dato'}</td></tr>
        </tbody></table></div>
        {confirming === item.csv.fullId ? <div><p><strong>¿Confirmás que son la misma compra?</strong> Esta acción conserva sus controles y observaciones.</p><button type="button" className="button primary" disabled={busy} onClick={() => void associate(item)}>Sí, confirmar asociación</button>{' '}<button type="button" className="button secondary" disabled={busy} onClick={() => setConfirming(null)}>Cancelar</button></div> : <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirming(item.csv.fullId)}>Revisar asociación</button>}
      </article>)}
      {message && <p role="status">{message}</p>}
      <button className="button secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Cerrar revisión</button>
    </>}
  </section>;
}
