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
  const tableRef = useRef<HTMLDivElement>(null), railRef = useRef<HTMLDivElement>(null), railContentRef = useRef<HTMLDivElement>(null);
  const params = useCallback((exporting = false) => { const p = new URLSearchParams(); for (const [key,value] of Object.entries(filters)) if (value) p.set(key, value); p.set('page', String(page)); if (exporting) p.set('export', 'xlsx'); return p.toString(); }, [filters, page]);
  const load = useCallback(async () => { const version = ++requestVersion.current; setLoading(true); setError(''); try { const response = await fetch('/api/mendel/purchase-control?' + params(), { cache: 'no-store' }); if (!response.ok) throw new Error(); const result = await response.json() as Data; if (version === requestVersion.current) setData(result); } catch { if (version === requestVersion.current) setError('No se pudo cargar el control de compras.'); } finally { if (version === requestVersion.current) setLoading(false); } }, [params]);
  useEffect(() => { const timer = setTimeout(() => void load(), 250); return () => clearTimeout(timer); }, [load, importRevision]);
  useEffect(() => {
    const wrapper = tableRef.current, table = wrapper?.querySelector('table'), content = railContentRef.current;
    if (!wrapper || !table || !content) return;
    const updateWidth = () => { content.style.width = `${table.scrollWidth}px`; };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(table);
    return () => observer.disconnect();
  }, [data?.items.length]);
  const syncFromRail = () => { if (tableRef.current && railRef.current) tableRef.current.scrollLeft = railRef.current.scrollLeft; };
  const syncFromTable = () => { if (tableRef.current && railRef.current) railRef.current.scrollLeft = tableRef.current.scrollLeft; };
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
    {data && <div className={s.summary} aria-label="Resumen del control">
      <span><strong>{data.summary.total.toLocaleString('es-AR')}</strong> transacciones</span>
      <span>Cargadas <strong>{data.summary.loaded.toLocaleString('es-AR')}</strong></span>
      <span>Pendientes de carga <strong>{data.summary.pendingLoad.toLocaleString('es-AR')}</strong></span>
      <span>Descargadas <strong>{data.summary.downloaded.toLocaleString('es-AR')}</strong></span>
      <span>Pendientes de descarga <strong>{data.summary.pendingDownload.toLocaleString('es-AR')}</strong></span>
      <span>Diferencias <strong>{data.summary.mismatch.toLocaleString('es-AR')}</strong></span>
      <span>Sin confirmar: carga <strong>{data.summary.unconfirmedLoad.toLocaleString('es-AR')}</strong> · descarga <strong>{data.summary.unconfirmedDownload.toLocaleString('es-AR')}</strong></span>
    </div>}
    {error && <p role="alert">{error}</p>}{loading && <p role="status">Actualizando control…</p>}
    <div className={s.tableNav}>
      <span>Columnas</span>
      <div className={s.horizontalRail} ref={railRef} onScroll={syncFromRail} role="region" aria-label="Barra para desplazar la tabla hacia las columnas de la derecha" aria-controls="mendel-purchase-table" tabIndex={0} onKeyDown={event => { const rail = railRef.current; if (!rail) return; if (event.key === 'ArrowRight') rail.scrollBy({ left: 160 }); if (event.key === 'ArrowLeft') rail.scrollBy({ left: -160 }); if (event.key === 'Home') rail.scrollLeft = 0; if (event.key === 'End') rail.scrollLeft = rail.scrollWidth; }}>
        <div ref={railContentRef} className={s.horizontalRailContent} />
      </div>
      <span className={s.scrollHint}>Deslizá para ver las columnas de la derecha</span>
    </div>
    <div className={`mendel-table-wrap ${s.tableWrap}`} ref={tableRef} onScroll={syncFromTable} role="region" aria-label="Tabla de compras, desplazable horizontalmente" tabIndex={0}>
      <table id="mendel-purchase-table" className={s.table}><thead><tr><th>Fecha / zona</th><th>Número de factura</th><th>Compra</th><th>Comentario de Mendel</th><th>Observación de FNET</th><th>ID Mendel</th><th>Va en Oppen</th><th>Web Claro<br/>(debe cargar)</th><th>Cargada en Intra</th><th>Descargada en Intra</th><th>Estado</th></tr></thead><tbody>{data?.items.map(item => <MendelPurchaseRow key={`${item.transactionId}:${item.details.version}:${item.intra.eventId}:${item.intra.sourceHash}:${item.details.sourceInvoice}`} item={item} onSaved={updated => {setData(previous=>previous?{...previous,items:previous.items.map(p=>p.transactionId===updated.transactionId?updated:p)}:previous); void load();}} />)}</tbody></table>{data && data.items.length === 0 && <p>No hay compras para estos filtros.</p>}
    </div>
    {data && data.summary.total > 50 && <div className="mendel-pagination"><button className="button secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page} de {Math.ceil(data.summary.total / 50)}</span><button className="button secondary" disabled={page * 50 >= data.summary.total} onClick={() => setPage(p => p + 1)}>Siguiente</button></div>}
  </section>;
}
