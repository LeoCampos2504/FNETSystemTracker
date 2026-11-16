'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MendelPurchaseRow, type PurchaseRow } from './mendel-purchase-row';
import s from './mendel-purchase-control.module.css';

type Data = { items: PurchaseRow[]; page: number; options: { zones: string[]; budgets: string[]; categories: string[]; transactionStatuses: string[] }; summary: { total: number; loaded: number; pendingLoad: number; downloaded: number; pendingDownload: number; unconfirmedLoad: number; unconfirmedDownload: number; mismatch: number } };
type Filters = { q: string; view: string; zone: string; budget: string; category: string; from: string; to: string; merchant: string; status: string; transactionStatus: string; invoice: string; id: string };
const empty: Filters = { q: '', view: '', zone: '', budget: '', category: '', from: '', to: '', merchant: '', status: '', transactionStatus: '', invoice: '', id: '' };

export function MendelPurchaseControl({ importRevision }: { importRevision: number }) {
  const [filters, setFilters] = useState(empty), [page, setPage] = useState(1), [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const params = useCallback((exporting = false) => { const p = new URLSearchParams(); for (const [key,value] of Object.entries(filters)) if (value) p.set(key, value); p.set('page', String(page)); if (exporting) p.set('export', 'xlsx'); return p.toString(); }, [filters, page]);
  const load = useCallback(async () => { const version = ++requestVersion.current; setLoading(true); setError(''); try { const response = await fetch('/api/mendel/purchase-control?' + params(), { cache: 'no-store' }); if (!response.ok) throw new Error(); const result = await response.json() as Data; if (version === requestVersion.current) setData(result); } catch { if (version === requestVersion.current) setError('No se pudo cargar el control de compras.'); } finally { if (version === requestVersion.current) setLoading(false); } }, [params]);
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load, importRevision]);
  const change = (key: keyof Filters, value: string) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  return <section className="mendel-table-card" aria-label="Control de compras Mendel">
    <div className="mendel-table-heading"><div><h2>Control de compras</h2><p>Filtrá los gastos y revisá si corresponde cargarlos y descargarlos en Intra.</p></div><a className="button primary" href={'/api/mendel/purchase-control?' + params(true)}>Descargar Excel filtrado</a></div>
    <div className={s.filters}>
      <label>Buscar <input value={filters.q} onChange={e => change('q', e.target.value)} /></label>
      <label>Vista <select value={filters.view} onChange={e => change('view', e.target.value)}><option value="">Todas</option><option value="civil">Civil</option><option value="viaticos">Viáticos</option><option value="other">Otros</option></select></label>
      <label>Zona <select value={filters.zone} onChange={e => change('zone', e.target.value)}><option value="">Todas</option><option value="__sin_zona__">Sin zona</option>{data?.options.zones.map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Presupuesto <select value={filters.budget} onChange={e => change('budget', e.target.value)}><option value="">Todos</option>{data?.options.budgets.map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Categoría <select value={filters.category} onChange={e => change('category', e.target.value)}><option value="">Todas</option>{data?.options.categories.map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Desde <input type="date" value={filters.from} onChange={e => change('from', e.target.value)} /></label><label>Hasta <input type="date" value={filters.to} onChange={e => change('to', e.target.value)} /></label>
      <label>Proveedor <input value={filters.merchant} onChange={e => change('merchant', e.target.value)} /></label><label>Factura <input value={filters.invoice} onChange={e => change('invoice', e.target.value)} /></label><label>ID transacción <input value={filters.id} onChange={e => change('id', e.target.value)} /></label>
      <label>Estado de pago <select value={filters.transactionStatus} onChange={e => change('transactionStatus', e.target.value)}><option value="">Todos</option>{data?.options.transactionStatuses.map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Estado <select value={filters.status} onChange={e => change('status', e.target.value)}><option value="">Todos</option><option value="pending-load">Pendientes de carga o sin confirmar</option><option value="loaded">Cargadas</option><option value="pending-download">Pendientes de descarga o sin confirmar</option><option value="downloaded">Descargadas</option><option value="mismatch">Diferencias</option></select></label>
    </div>
    {data && <p>{data.summary.total} transacciones · Cargadas: {data.summary.loaded} · Pendientes de carga: {data.summary.pendingLoad} · Descargadas: {data.summary.downloaded} · Pendientes de descarga: {data.summary.pendingDownload} · Diferencias: {data.summary.mismatch} · De las pendientes, sin confirmar carga: {data.summary.unconfirmedLoad} / descarga: {data.summary.unconfirmedDownload}</p>}
    {error && <p role="alert">{error}</p>}{loading && <p role="status">Actualizando control…</p>}
    <p className={s.scrollHint}>Deslizá hacia los lados para ver todos los controles.</p><div className="mendel-table-wrap" role="region" aria-label="Tabla de compras, desplazable horizontalmente" tabIndex={0}><table className={s.table}><thead><tr><th>Fecha / zona</th><th>Número de factura</th><th>Compra</th><th>Comentario de Mendel</th><th>Observación de FNET</th><th>ID Mendel</th><th>Va en Oppen</th><th>Web Claro<br/>(debe cargar)</th><th>Cargada en Intra</th><th>Descargada en Intra</th><th>Estado</th></tr></thead><tbody>{data?.items.map(item => <MendelPurchaseRow key={`${item.transactionId}:${item.details.version}:${item.intra.eventId}:${item.intra.sourceHash}:${item.details.sourceInvoice}`} item={item} onSaved={updated => {setData(previous=>previous?{...previous,items:previous.items.map(p=>p.transactionId===updated.transactionId?updated:p)}:previous); void load();}} />)}</tbody></table>{data && data.items.length === 0 && <p>No hay compras para estos filtros.</p>}</div>
    {data && data.summary.total > 50 && <div className="mendel-pagination"><button className="button secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page} de {Math.ceil(data.summary.total / 50)}</span><button className="button secondary" disabled={page * 50 >= data.summary.total} onClick={() => setPage(p => p + 1)}>Siguiente</button></div>}
  </section>;
}
