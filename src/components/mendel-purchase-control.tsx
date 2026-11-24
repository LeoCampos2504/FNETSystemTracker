'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { MendelPurchaseRow, type PurchaseRow } from './mendel-purchase-row';
import s from './mendel-purchase-control.module.css';

type Data = { items: PurchaseRow[]; page: number; options: { zones: string[]; budgets: string[]; categories: string[]; transactionStatuses: string[] }; summary: { total: number; loaded: number; pendingLoad: number; downloaded: number; pendingDownload: number; unconfirmedLoad: number; unconfirmedDownload: number; mismatch: number } };
type Filters = { q: string; view: string; zone: string; budget: string; category: string; from: string; to: string; merchant: string; status: string; transactionStatus: string; invoice: string; id: string };
const empty: Filters = { q: '', view: '', zone: '', budget: '', category: '', from: '', to: '', merchant: '', status: '', transactionStatus: '', invoice: '', id: '' };

function PurchaseFilters({ filters, options, onChange }: { filters: Filters; options: Data['options'] | undefined; onChange: (key: keyof Filters, value: string) => void }) {
  return <div className={s.filters} aria-label="Filtros de compras">
    <label>Buscar <input placeholder="Proveedor, factura o ID" value={filters.q} onChange={e => onChange('q', e.target.value)} /></label>
    <label>Vista <select value={filters.view} onChange={e => onChange('view', e.target.value)}><option value="">Todas</option><option value="civil">Civil</option><option value="viaticos">Viáticos</option><option value="other">Otros</option></select></label>
    <label>Zona <select value={filters.zone} onChange={e => onChange('zone', e.target.value)}><option value="">Todas</option><option value="__sin_zona__">Sin zona</option>{options?.zones.map(v => <option key={v}>{v}</option>)}</select></label>
    <label>Presupuesto <select value={filters.budget} onChange={e => onChange('budget', e.target.value)}><option value="">Todos</option>{options?.budgets.map(v => <option key={v}>{v}</option>)}</select></label>
    <label>Categoría <select value={filters.category} onChange={e => onChange('category', e.target.value)}><option value="">Todas</option>{options?.categories.map(v => <option key={v}>{v}</option>)}</select></label>
    <label>Desde <input type="date" value={filters.from} onChange={e => onChange('from', e.target.value)} /></label>
    <label>Hasta <input type="date" value={filters.to} onChange={e => onChange('to', e.target.value)} /></label>
    <label>Proveedor <input value={filters.merchant} onChange={e => onChange('merchant', e.target.value)} /></label>
    <label>Factura <input value={filters.invoice} onChange={e => onChange('invoice', e.target.value)} /></label>
    <label>ID transacción <input value={filters.id} onChange={e => onChange('id', e.target.value)} /></label>
    <label>Estado de pago <select value={filters.transactionStatus} onChange={e => onChange('transactionStatus', e.target.value)}><option value="">Todos</option>{options?.transactionStatuses.map(v => <option key={v}>{v}</option>)}</select></label>
    <label>Estado <select value={filters.status} onChange={e => onChange('status', e.target.value)}><option value="">Todos</option><option value="pending-load">Pendientes de carga o sin confirmar</option><option value="loaded">Cargadas</option><option value="pending-download">Pendientes de descarga o sin confirmar</option><option value="downloaded">Descargadas</option><option value="mismatch">Diferencias</option></select></label>
  </div>;
}

function PurchaseSummary({ summary }: { summary: Data['summary'] }) {
  const stats = [
    { label: 'Transacciones', value: summary.total },
    { label: 'Cargadas', value: summary.loaded },
    { label: 'Pendientes de carga', value: summary.pendingLoad },
    { label: 'Descargadas', value: summary.downloaded },
    { label: 'Pendientes de descarga', value: summary.pendingDownload },
    { label: 'Diferencias', value: summary.mismatch },
  ];
  return <div className={s.summary} aria-label="Resumen del control">
    {stats.map(stat => <span key={stat.label}><strong>{stat.value.toLocaleString('es-AR')}</strong>{stat.label}</span>)}
    <span className={s.unconfirmed}>Sin confirmar: carga <strong>{summary.unconfirmedLoad.toLocaleString('es-AR')}</strong> · descarga <strong>{summary.unconfirmedDownload.toLocaleString('es-AR')}</strong></span>
  </div>;
}

export function MendelPurchaseControl({ importRevision }: { importRevision: number }) {
  const [filters, setFilters] = useState(empty), [page, setPage] = useState(1), [data, setData] = useState<Data | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const tableRef = useRef<HTMLDivElement>(null), railRef = useRef<HTMLDivElement>(null), railContentRef = useRef<HTMLDivElement>(null);
  const tableId = useId();
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
    <div className={s.controlHeader}>
      <div><span className={s.kicker}>Mendel · Intra</span><h2>Control de compras</h2><p>Filtrá y seguí cada transacción sin salir de esta pantalla.</p></div>
      <a className="button primary" href={'/api/mendel/purchase-control?' + params(true)}>Descargar Excel filtrado</a>
    </div>
    <PurchaseFilters filters={filters} options={data?.options} onChange={change} />
    {data && <PurchaseSummary summary={data.summary} />}
    {error && <p className={s.noticeError} role="alert">{error}</p>}{loading && <p className={s.loading} role="status">Actualizando control…</p>}
    <div className={s.tableNav}>
      <span className={s.tableNavLabel}><ArrowLeftRight size={14} /> Columnas</span>
      <div className={s.horizontalRail} ref={railRef} onScroll={syncFromRail} role="region" aria-label="Barra para desplazar la tabla hacia las columnas de la derecha" aria-controls={tableId} tabIndex={0} onKeyDown={event => { const rail = railRef.current; if (!rail) return; if (event.key === 'ArrowRight') rail.scrollBy({ left: 160 }); if (event.key === 'ArrowLeft') rail.scrollBy({ left: -160 }); if (event.key === 'Home') rail.scrollLeft = 0; if (event.key === 'End') rail.scrollLeft = rail.scrollWidth; }}>
        <div ref={railContentRef} className={s.horizontalRailContent} />
      </div>
      <span className={s.scrollHint}>Deslizá para ver las columnas de la derecha</span>
    </div>
    <div className={`mendel-table-wrap ${s.tableWrap}`} ref={tableRef} onScroll={syncFromTable} role="region" aria-label="Tabla de compras, desplazable horizontalmente" tabIndex={0}>
      <table id={tableId} className={s.table}><thead><tr><th>Fecha / zona</th><th>Número de factura</th><th>Compra</th><th>Comentario de Mendel</th><th>Observación de FNET</th><th>ID Mendel</th><th>Va en Oppen</th><th>Web Claro<br/>(debe cargar)</th><th>Cargada en Intra</th><th>Descargada en Intra</th><th>Estado</th></tr></thead><tbody>{data?.items.map(item => <MendelPurchaseRow key={`${item.transactionId}:${item.details.version}:${item.intra.eventId}:${item.intra.sourceHash}:${item.details.sourceInvoice}`} item={item} onSaved={updated => {setData(previous=>previous?{...previous,items:previous.items.map(p=>p.transactionId===updated.transactionId?updated:p)}:previous); void load();}} />)}</tbody></table>{data && data.items.length === 0 && <p className={s.empty}>No hay compras para estos filtros.</p>}
    </div>
    {data && data.summary.total > 50 && <div className="mendel-pagination"><button className="button secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page} de {Math.ceil(data.summary.total / 50)}</span><button className="button secondary" disabled={page * 50 >= data.summary.total} onClick={() => setPage(p => p + 1)}>Siguiente</button></div>}
  </section>;
}
