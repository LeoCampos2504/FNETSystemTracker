'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { IntraHistory, IntraLine, IntraOverview, IntraRecord, IntraTarget } from '@/contracts/intra-stock';
import type { SiteFuelLoad } from '@/contracts/operations';
import { allocationLimits, intraFuelTotals, lineUse, milli, validAllocation } from '@/lib/intra-stock';
import { fold } from '@/lib/filters';
import { operationalDateKey } from '@/lib/operational-timezone';
import { notifySessionExpired } from './operations-common';
import s from './intra-stock-control.module.css';

const endpoint = '/api/operations/intra-stock';
const quantity = (n: number, fuel = false) => n.toLocaleString('es-AR', { maximumFractionDigits: 3 }) + (fuel ? ' L' : '');
const day = (s: string | null) => s ? operationalDateKey(s).split('-').reverse().join('/') : '—';
const errors: Record<string, string> = {
  UNAUTHENTICATED: 'Ingresá nuevamente para continuar.', FORBIDDEN: 'Este control está habilitado para Administración.',
  STALE_VERSION: 'Otra persona actualizó el control. Pulsá Actualizar y revisá antes de guardar.',
  INTRA_FILE_TOO_LARGE: 'El Excel debe pesar hasta 2 MB.', INTRA_FILE_INVALID: 'Usá el Excel original de Intra con una sola hoja, sin fórmulas, macros ni vínculos externos.',
  INTRA_HEADERS_INVALID: 'No se encontraron las columnas Fecha, Factura, Proveedor, Reg-Zon-SZon, Producto, Disponible, Monto Neto y Liquidada.',
  INTRA_NUMBER_INVALID: 'Hay una cantidad o un importe inválido. No se importó ninguna fila.', INTRA_DATE_INVALID: 'Hay una fecha inválida. No se importó ninguna fila.',
  INTRA_SCOPE_INVALID: 'Revisá las localidades incluidas. No se confirmó ningún cambio.', INTRA_ROW_LIMIT: 'Se admiten hasta 2.000 renglones por Excel.',
  INTRA_ALLOCATION_INVALID: 'La cantidad supera lo pendiente o no coincide la operación/producto. Revisá el vínculo.',
  INTRA_SOURCE_CHANGED: 'Cambió la carga, su OK o el insumo. Actualizá antes de vincular.',
  INTRA_HISTORY_LIMIT: 'Se alcanzó el límite de este control. No se borró el historial ni se confirmó el cambio. Pedí ampliar la capacidad.',
};
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (response.status === 401) notifySessionExpired();
  const data = await response.json();
  if (!response.ok) throw Error(errors[data.code] ?? 'No se pudo completar la operación. Actualizá y reintentá.');
  return data;
}
const json = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function IntraStockControl({ fuelRevision }: { fuelRevision: SiteFuelLoad[] }) {
  const [open, setOpen] = useState(false);
  return <section className={s.panel}>
    <div className={s.heading}><div><h2>Intra · Stock y usos</h2><p>Compará las facturas pendientes con lo utilizado. El historial se conserva aunque dejen de aparecer en el Excel.</p></div><button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Cerrar comparación' : 'Comparar con Intra'}</button></div>
    {open && <Control fuelRevision={fuelRevision} />}
  </section>;
}
function Control({ fuelRevision }: { fuelRevision: SiteFuelLoad[] }) {
  const [data, setData] = useState<IntraOverview | null>(null), [error, setError] = useState(''), [success, setSuccess] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false), input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<{ rows: IntraLine[]; version: number } | null>(null), [extraScopes, setExtraScopes] = useState<string[]>([]), [complete, setComplete] = useState(false);
  const [operation, setOperation] = useState(''), [type, setType] = useState('fuel'), [status, setStatus] = useState('present'), [query, setQuery] = useState(''), [page, setPage] = useState(1), [selected, setSelected] = useState('');
  const [history, setHistory] = useState<IntraHistory[] | null>(null), [older, setOlder] = useState(false);
  const reload = async () => { setData(await call<IntraOverview>(endpoint)); };
  useEffect(() => {
    let active = true;
    call<IntraOverview>(endpoint).then(d => { if (active) setData(d); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [fuelRevision]);
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setSuccess('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function inspect(chosen: File) {
    await run(async () => {
      setPreview(null); setFile(null);
      if (chosen.size > 2 * 1024 * 1024) throw Error(errors.INTRA_FILE_TOO_LARGE);
      const parsed = await call<{ rows: IntraLine[] }>(endpoint + '?action=preview', { method: 'POST', body: chosen });
      setFile(chosen); setPreview({ rows: parsed.rows, version: data!.version }); setExtraScopes([]); setComplete(false);
    });
  }
  const scopes = [...new Set(preview?.rows.map(r => r.scope) ?? [])];
  const rows = (data?.records ?? []).filter(r => (!operation || r.operation === operation) && (type === 'all' || r.fuel === (type === 'fuel')) && (status === 'all' || r.present === (status === 'present')) && fold([r.invoice,r.supplier,r.product,r.location].join(' ')).includes(fold(query))).sort((a, b) => b.date.localeCompare(a.date) || a.invoice.localeCompare(b.invoice));
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / 30)));
  const picked = data?.records.find(r => r.id === selected);
  const totals = data ? intraFuelTotals(data).filter(t => !operation || t.operation === operation) : [];
  const showHistory = async (before?: number) => run(async () => {
    const result = await call<{ history: IntraHistory[] }>(endpoint + '?history=1' + (before ? '&before=' + before : ''));
    setHistory(old => before ? [...(old ?? []), ...result.history] : result.history); setOlder(result.history.length === 100);
  });
  return <>
    <div className={s.toolbar}>
      <input ref={input} type="file" accept=".xlsx" hidden disabled={busy || !data} onChange={e => { const chosen = e.target.files?.[0]; e.target.value = ''; if (chosen) void inspect(chosen); }} />
      <button type="button" className={s.primary} disabled={busy || !data} onClick={() => input.current?.click()}>Cargar Excel de Intra</button>
      <button type="button" disabled={busy} onClick={() => void run(async () => {
        const fresh = await call<IntraOverview>(endpoint); setData(fresh);
        setPreview(p => p ? { ...p, version: fresh.version } : null); setComplete(false);
      })}>Actualizar</button>
      <button type="button" disabled={busy} onClick={() => history ? setHistory(null) : void showHistory()}>Historial</button>
      {busy && <span role="status">Procesando…</span>}
    </div>
    {error && <p role="alert" className={s.error}>{error}</p>}{success && <p role="status" className={s.success}>{success}</p>}
    {!data && !error && <p>Consultando el control compartido…</p>}
    {preview && file && data && <div className={s.preview}>
      <strong>{file.name} · {preview.rows.length} renglones · {preview.rows.filter(r => r.fuel).length} de combustible</strong>
      <p>Se actualizarán: {scopes.join(' · ') || 'ninguna localidad con renglones'}. Las demás conservan su última importación.</p>
      {data.scopes.filter(s => !scopes.includes(s.name)).map(scope => <label className={s.check} key={scope.name}><input type="checkbox" checked={extraScopes.includes(scope.name)} onChange={e => setExtraScopes(e.target.checked ? [...extraScopes, scope.name] : extraScopes.filter(s => s !== scope.name))} />También actualizar {scope.name} como vacía</label>)}
      <label className={s.check}><input type="checkbox" checked={complete} onChange={e => setComplete(e.target.checked)} />Este archivo incluye todos los pendientes de las localidades seleccionadas. Lo que no figure pasará al historial.</label>
      <div className={s.toolbar}><button className={s.primary} disabled={busy || !complete || !(scopes.length + extraScopes.length)} onClick={() => void run(async () => {
        const result = await call<{ unchanged: boolean }>(endpoint + '?action=import', { method: 'POST', body: file, headers: { 'x-file-name': encodeURIComponent(file.name), 'x-intra-meta': encodeURIComponent(JSON.stringify({ version: preview.version, scopes: [...scopes, ...extraScopes], complete: true })) } });
        setPreview(null); setFile(null); setHistory(null); await reload(); setSuccess(result.unchanged ? 'Este Excel ya estaba guardado. No se duplicaron cantidades.' : 'Excel guardado. Se conservaron las facturas anteriores y los usos vinculados.');
      })}>Guardar y comparar</button><button disabled={busy} onClick={() => { setPreview(null); setFile(null); }}>Cancelar</button></div>
    </div>}
    {data && <>
      <p className={s.hint}>«Disponible» es lo pendiente de descargar en Intra, no una entrada histórica. Un OK en FNET indica uso; no modifica Intra. Esta comparación usa todos los registros guardados, independientemente de los filtros de cargas de arriba.</p>
      <div className={s.filters}>
        <label>Operación<select value={operation} onChange={e => { setOperation(e.target.value); setPage(1); }}><option value="">Todas las importadas</option>{[...new Set(data.records.map(r => r.operation))].sort().map(o => <option key={o}>{o}</option>)}</select></label>
        <label>Producto<select value={type} onChange={e => { setType(e.target.value); setPage(1); }}><option value="fuel">Combustible</option><option value="supplies">Otros insumos</option><option value="all">Todos</option></select></label>
        <label>Ver<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="present">Pendientes en último Excel</option><option value="absent">Ya no figuran · historial</option><option value="all">Todos, incluido historial</option></select></label>
        <label>Buscar<input value={query} placeholder="Factura, producto, proveedor o localidad" onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
      </div>
      {type !== 'supplies' && totals.map(t => <div className={s.totals} key={t.operation}><h3>{t.operation} · Combustible</h3><Metric label="Pendiente en Intra · importado" value={quantity(t.pending, true)} /><Metric label="Usado vinculado · por descargar" value={quantity(t.used, true)} /><Metric label="Pendiente de justificar" value={quantity(t.remaining, true)} /><Metric label="OK sin vincular a factura" value={quantity(t.unlinked, true)} /></div>)}
      {data.records.some(r => r.present && r.duplicate) && <p className={s.error}>El Excel repite renglones idénticos. Se conservan todos; los totales son provisionales y esos renglones no se vinculan automáticamente.</p>}
      {!data.scopes.length && <p>Todavía no cargaste una planilla de Intra.</p>}
      <details className={s.meta}><summary>Última importación por localidad</summary>{data.scopes.map(scope => <p key={scope.name}>{scope.name} · {day(scope.importedAt)} · {scope.importedBy} · {scope.fileName}</p>)}</details>
      <div className={s.table}><table><thead><tr>{['Fecha factura','Operación / localidad','Factura / proveedor','Producto','En Excel','Uso vinculado','Por justificar','Control'].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.slice((current - 1) * 30, current * 30).map(row => {
        const use = lineUse(row, data);
        return <tr key={row.id}><td>{day(row.date)}</td><td><strong>{row.operation}</strong><small>{row.location}</small></td><td>{row.invoice}<small>{row.supplier}</small></td><td>{row.product}<small>{row.present ? 'Pendiente en Intra' : 'Ya no figura desde ' + day(row.missingSince)}</small></td><td>{quantity(row.quantity, row.fuel)}<small>{row.present ? 'Último Excel' : 'Última cantidad observada'}</small></td><td>{quantity(use.used, row.fuel)}{use.invalid && <small className={s.error}>Cambió un uso: revisar vínculo</small>}</td><td>{row.present ? quantity(use.remaining, row.fuel) : 'Histórico'}</td><td><button disabled={busy} onClick={() => setSelected(row.id)}>Ver / vincular</button>{row.duplicate && <small>Renglón idéntico repetido: revisar en origen</small>}</td></tr>;
      })}</tbody></table></div>
      <div className={s.toolbar}><span>{rows.length} renglones · página {current} de {Math.max(1, Math.ceil(rows.length / 30))}</span><button disabled={busy || current === 1} onClick={() => setPage(current - 1)}>Anterior</button><button disabled={busy || current * 30 >= rows.length} onClick={() => setPage(current + 1)}>Siguiente</button></div>
      <p className={s.hint}>Si una factura desaparece no se borra su registro. «Ya no figura» no confirma por sí solo quién la descargó ni cuándo. «Liquidada» se conserva como dato de la factura y no se interpreta como consumo.</p>
      {picked && <LinkPanel key={picked.id + ':' + data.version} row={picked} data={data} busy={busy} onClose={() => setSelected('')} onChange={body => run(async () => { await call(endpoint + '?action=link', json(body)); await reload(); setHistory(null); setSuccess('Control guardado con autor, fecha e historial.'); })} />}
    </>}
    {history && <div className={s.history}><h3>Historial de importaciones y usos</h3>{history.map(h => <p key={h.version}><strong>#{h.version} · {day(h.at)} · {h.actor}</strong><br />{h.change}</p>)}{!history.length && <p>Sin movimientos registrados.</p>}{older && <button disabled={busy} onClick={() => void showHistory(history.at(-1)?.version)}>Ver anteriores</button>}</div>}
  </>;
}
const Metric = ({ label, value }: { label: string; value: ReactNode }) => <div><small>{label}</small><strong>{value}</strong></div>;
function LinkPanel({ row, data, busy, onClose, onChange }: { row: IntraRecord; data: IntraOverview; busy: boolean; onClose: () => void; onChange: (body: unknown) => Promise<void> }) {
  const [search, setSearch] = useState(''), [picked, setPicked] = useState(''), [amount, setAmount] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.scrollIntoView({ block: 'nearest' }); panel.current?.focus({ preventScroll: true }); }, []);
  const candidates = data.targets.filter(t => t.operation === row.operation && (t.kind === 'FUEL') === row.fuel && (row.fuel || fold(t.description) === fold(row.product)) && (!t.invoice || t.invoice.replace(/\s|-/g, '').toUpperCase() === row.invoice.replace(/\s|-/g, '').toUpperCase()));
  const target = candidates.find(t => t.kind + ':' + t.id === picked);
  const remaining = (t: IntraTarget) => (milli(t.quantity) - data.allocations.filter(a => a.targetId === t.id && a.targetKind === t.kind && validAllocation(a, data.targets, data.records)).reduce((s, a) => s + milli(a.quantity), 0)) / 1000;
  const options = candidates.filter(t => remaining(t) > 0 && fold([t.formCode,t.siteCode,t.description].join(' ')).includes(fold(search)));
  const numeric = Number(amount.replace(',', '.'));
  return <div ref={panel} className={s.linkPanel} tabIndex={-1} role="region" aria-label={'Vincular factura ' + row.invoice}>
    <div className={s.heading}><div><h3>{row.invoice} · {row.product}</h3><p>{row.scope} · {quantity(row.quantity, row.fuel)}</p></div><button disabled={busy} onClick={onClose}>Cerrar detalle</button></div>
    <p className={s.hint}>Primera importación {day(row.firstSeen)} · última presencia {day(row.lastSeen)}{row.missingSince ? ' · no figura desde ' + day(row.missingSince) : ''}. Liquidada: {row.liquidated || 'sin dato'}.</p>
    {data.allocations.filter(a => a.lineId === row.id).map(a => <div className={s.link} key={a.id}><span><strong>{a.formCode} · {quantity(a.quantity, row.fuel)}</strong><small>{a.createdBy} · {day(a.createdAt)} · {!a.active ? `Vínculo retirado por ${a.removedBy ?? 'Administración'} el ${day(a.removedAt ?? null)}` : validAllocation(a, data.targets, data.records) ? 'Uso vinculado' : 'Revisar: cambió el uso o su OK'}</small></span>{a.active && <button disabled={busy} onClick={() => void onChange({ action: 'unlink', version: data.version, id: a.id })}>Quitar vínculo</button>}</div>)}
    {row.present && !row.duplicate && lineUse(row, data).remaining > 0 && <>
      <p>{row.fuel ? 'Elegí una carga marcada OK y la cantidad que corresponde a esta factura. Podés vincular varias facturas al mismo FO.' : 'Se muestran insumos declarados del mismo producto y operación. Revisá su uso antes de vincular; no se cambia el control original de Insumos.'}</p>
      <div className={s.filters}>
        <label>Buscar uso<input value={search} placeholder="FO o sitio" onChange={e => { setSearch(e.target.value); setPicked(''); setAmount(''); }} /></label>
        <label>Carga / insumo<select value={picked} onChange={e => {
          setPicked(e.target.value); const t = candidates.find(t => t.kind + ':' + t.id === e.target.value);
          setAmount(t ? String(Math.min(remaining(t), lineUse(row, data).remaining)) : '');
        }}><option value="">Seleccionar…</option>{options.slice(0, 100).map(t => <option key={t.kind + ':' + t.id} value={t.kind + ':' + t.id}>{t.formCode} · {t.siteCode} · {quantity(remaining(t), row.fuel)} pendientes de vincular</option>)}</select></label>
        <label>{row.fuel ? 'Litros de esta factura' : 'Cantidad de este producto'}<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      </div>
      {options.length > 100 && <p>Refiná la búsqueda para ver otros formularios.</p>}
      {!candidates.some(t => remaining(t) > 0) && <p>No hay usos compatibles pendientes de vincular. Para combustible, marcá primero OK en la carga; los usos ya vinculados no se cuentan otra vez.</p>}
      {target && <p className={s.hint}>{target.formCode} · {target.siteCode} · {target.description} · {quantity(remaining(target), row.fuel)} sin vincular. Este vínculo usa {quantity(Number.isFinite(numeric) ? numeric : 0, row.fuel)}.</p>}
      <button className={s.primary} disabled={busy || !target || !/^\d+(?:[.,]\d{1,3})?$/.test(amount) || !allocationLimits(data, row, target, numeric)} onClick={() => target && void onChange({ action: 'link', version: data.version, lineId: row.id, targetId: target.id, targetKind: target.kind, targetHash: target.hash, quantity: numeric })}>Confirmar uso vinculado</button>
    </>}
  </div>;
}
