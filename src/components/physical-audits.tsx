'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AUDIT_STATES, auditDue, filterAudits, nextAuditDate, parseAuditSheet, type AuditData, type AuditFilters, type AuditHistory, type AuditImportRow, type AuditPerson } from '@/lib/physical-audits';
import { operationalDateKey } from '@/lib/operational-timezone';
import s from './physical-audits.module.css';

const EMPTY: AuditData = { name: '', role: '', sector: '', location: '', status: 'Pendiente', lastDate: '', nextDate: '', notes: '', exception: '' };
const FILTERS: AuditFilters = { query: '', sector: '', status: '', due: '', warningDays: 15 };
const messages: Record<string, string> = { FORBIDDEN: 'Solo Administración puede modificar auditorías.', UNAUTHENTICATED: 'Tu sesión venció. Volvé a ingresar.', AUDIT_STORAGE_PENDING: 'El módulo está preparado pero todavía falta habilitar sus tablas. No se guardó nada.', STALE_VERSION: 'Otra persona modificó este registro. Actualizá antes de guardar.', INPUT_INVALID: 'Revisá los campos, las fechas y el motivo de la excepción.', AUDIT_DATE_REQUIRED: 'Para registrar una auditoría realizada completá su fecha.', CONCURRENT_OR_DUPLICATE_RECORD: 'Ya existe esta persona o se guardó desde otra sesión. Actualizá la lista.', FILE_TYPE_INVALID: 'Adjuntá PDF, Excel .xlsx, JPG, PNG o WebP válidos, sin macros.', FILE_TOO_LARGE: 'Cada archivo puede ocupar hasta 8 MB.', AUDIT_FILE_LIMIT: 'Una auditoría admite hasta 20 archivos y 48 MB en total.' };
async function result<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) throw Error(messages[data.code] || 'No se pudo completar la operación. No se confirmó el guardado.');
  return data;
}
async function post<T>(data: unknown) { return result<T>(await fetch('/api/auditorias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })); }
const fmt = (date: string) => date ? date.split('-').reverse().join('/') : 'Sin fecha';

export function PhysicalAudits({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<AuditPerson[]>([]), [filters, setFilters] = useState({ ...FILTERS });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [selected, setSelectedState] = useState<AuditPerson | null>(null), [history, setHistory] = useState<AuditHistory[]>([]), [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false), [historyAttempt, setHistoryAttempt] = useState(0);
  const [editor, setEditor] = useState(false), [data, setData] = useState<AuditData>({ ...EMPTY }), [cuil, setCuil] = useState(''), [kind, setKind] = useState<'EDIT' | 'AUDIT'>('EDIT');
  const [preview, setPreview] = useState<{ name: string; rows: AuditImportRow[]; errors: string[] } | null>(null);
  const [fileRecord, setFileRecord] = useState('');
  const requestId = useRef('');
  const detailPanel = useRef<HTMLElement>(null);
  const today = operationalDateKey(new Date());
  useEffect(() => { if (selected || editor) detailPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [selected, editor]);
  const visible = useMemo(() => filterAudits(rows, filters, today), [rows, filters, today]);
  const sectors = [...new Set(rows.map(r => r.sector))].sort();
  const counts = (label: string) => rows.filter(r => auditDue(r, today, filters.warningDays) === label).length;
  const exportUrl = (all = false) => `/api/auditorias/export?${new URLSearchParams(Object.entries(all ? { ...FILTERS, warningDays: filters.warningDays } : filters).map(([k, v]) => [k, String(v)]))}`;
  async function load() { const value = await result<{ rows: AuditPerson[] }>(await fetch('/api/auditorias', { cache: 'no-store' })); setRows(value.rows); return value.rows; }
  useEffect(() => { let live = true; void fetch('/api/auditorias', { cache: 'no-store' }).then(r => result<{ rows: AuditPerson[] }>(r)).then(v => { if (live) setRows(v.rows); }).catch(e => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void fetch(`/api/auditorias?personId=${selected.id}`, { cache: 'no-store', signal: controller.signal }).then(r => result<{ history: AuditHistory[] }>(r)).then(v => { if (!controller.signal.aborted) { setHistory(v.history); setFileRecord(v.history[0]?.id ?? ''); } }).catch(e => { if (!controller.signal.aborted) setHistoryError(e.message); }).finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [selected, historyAttempt]);
  function setSelected(row: AuditPerson | null) {
    setSelectedState(row); setHistory([]); setHistoryError(''); setFileRecord(''); setHistoryLoading(!!row); setHistoryAttempt(n => n + 1);
  }
  function reloadHistory() { setHistory([]); setHistoryError(''); setFileRecord(''); setHistoryLoading(true); setHistoryAttempt(n => n + 1); }
  async function action(work: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); } finally { setBusy(false); } }
  function openEditor(row: AuditPerson | null, audit = false) {
    setSelected(row); setKind(audit ? 'AUDIT' : 'EDIT'); setCuil(row?.cuil ?? '');
    const next = row ? { name: row.name, role: row.role, sector: row.sector, location: row.location, status: row.status, lastDate: row.lastDate, nextDate: row.nextDate, notes: row.notes, exception: row.exception } : { ...EMPTY };
    setData(audit ? { ...next, status: 'Realizada', lastDate: today, nextDate: nextAuditDate(today), notes: '', exception: '' } : next);
    requestId.current = crypto.randomUUID(); setEditor(true); setError('');
  }
  async function save() {
    const saved = await post<{ id: string }>({ action: 'save', id: selected?.id ?? null, version: selected?.version ?? 0, ...(selected ? {} : { cuil: cuil.replace(/[\s-]/g, '') }), requestId: requestId.current, kind, data });
    setEditor(false); setNotice('Registro guardado. Podés adjuntar sus archivos en el historial.');
    const next = await load(); setSelected(next.find(r => r.id === saved.id) ?? null);
  }
  async function readExcel(file: File | undefined) {
    if (!file) return; if (file.size > 5 * 1024 * 1024) throw Error('La planilla supera 5 MB.');
    const { readSheet } = await import('read-excel-file/browser');
    const parsed = parseAuditSheet(await readSheet(file, 'Control_Auditorias'));
    setPreview({ name: file.name, ...parsed }); setNotice('Vista previa: todavía no se guardó la planilla.');
  }
  async function importPeople() {
    if (!preview || preview.errors.length || !preview.rows.length) return;
    let inserted = 0, unchanged = 0; const conflicts: string[] = [];
    let batch: AuditImportRow[] = [];
    async function flush() {
      if (!batch.length) return;
      const r = await post<{ inserted: number; unchanged: number; conflicts: string[] }>({ action: 'import', rows: batch });
      inserted += r.inserted; unchanged += r.unchanged; conflicts.push(...r.conflicts);
      setNotice(`${inserted} personas guardadas · ${unchanged} sin cambios · ${conflicts.length} requieren revisión. Si se interrumpe, podés reintentar sin duplicar.`);
      batch = [];
    }
    for (const row of preview.rows) {
      if (batch.length >= 50 || new TextEncoder().encode(JSON.stringify({ action: 'import', rows: [...batch, row] })).length > 60000) await flush();
      if (new TextEncoder().encode(JSON.stringify(row)).length > 58000) throw Error('Una fila supera el tamaño permitido. No se recortaron sus notas.');
      batch.push(row);
    }
    await flush();
    await load(); setPreview(null); setNotice(`Importación: ${inserted} nuevas · ${unchanged} sin cambios · ${conflicts.length} diferentes, no sobrescritas. El histórico se conserva.`);
    if (conflicts.length) setError('Hay personas ya guardadas con datos diferentes. Revisalas desde su ficha; la importación no reemplaza auditorías existentes.');
  }
  async function upload(files: File[]) {
    let saved = 0;
    try {
      for (const file of files) {
        const form = new FormData(); form.set('recordId', fileRecord); form.set('file', file);
        await result(await fetch('/api/auditorias/files', { method: 'POST', body: form })); saved++;
      }
      setNotice(`${saved} archivos adjuntados al registro seleccionado.`);
    } catch (e) { throw Error(`${saved} archivos guardados. ${e instanceof Error ? e.message : 'Error de carga.'} Reintentá los restantes; no se duplican archivos idénticos.`); }
    finally { reloadHistory(); }
  }
  return <main className={s.page}>
    <header className={s.heading}><div><Link href="/">← Volver a FNET</Link><p>FNET · Seguridad física</p><h1>Control de auditorías</h1><span>{canEdit ? 'Administración · edición habilitada' : 'Consulta · solo lectura'}</span></div><div className={s.actions}>
      <button disabled={busy} onClick={() => void action(async () => { await load(); setNotice('Listado actualizado.'); })}>Actualizar</button>
      <a href={exportUrl()}>Excel filtrado</a><a href={exportUrl(true)}>Excel completo</a>
      {canEdit && <><label className={s.fileButton}>Importar planilla<input type="file" accept=".xlsx" aria-label="Importar control de auditorías" disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void action(() => readExcel(f)); }} /></label><button className={s.primary} disabled={busy} onClick={() => openEditor(null)}>Agregar persona</button></>}
    </div></header>
    <p className={s.hint}>Auditorías cada 3 meses calendario, con excepciones registradas. Fechas operativas de Argentina. Los avisos se muestran aquí; no se envían correos ni WhatsApp.</p>
    <section className={s.summary} aria-label="Resumen de auditorías">{[['Personas', rows.length], ['Vencidas', counts('Vencida')], ['Vencen hoy', counts('Vence hoy')], ['Próximas', counts('Próxima')], ['Sin fecha', counts('Sin fecha')]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    {error && <p role="alert" className={s.error}>{error}</p>}<p role="status">{busy ? 'Procesando… ' : ''}{notice}</p>
    {preview && <section className={s.panel}><h2>Revisar importación · {preview.name}</h2><p>{preview.rows.length} personas válidas · {preview.errors.length} filas con errores. Se agregan nuevas; las existentes diferentes requieren revisión manual, sin sobrescribir.</p>{preview.errors.map(e => <p key={e} className={s.error}>{e}</p>)}<div className={s.tableWrap}><table><thead><tr><th>Persona</th><th>Sector</th><th>Estado</th><th>Próxima</th></tr></thead><tbody>{preview.rows.slice(0, 100).map(r => <tr key={r.cuil}><td>{r.data.name}</td><td>{r.data.sector}</td><td>{r.data.status}</td><td>{fmt(r.data.nextDate)}</td></tr>)}</tbody></table></div><p>Vista previa de las primeras 100 personas; se importan todas las válidas solo si no hay errores.</p><button className={s.primary} disabled={busy || !!preview.errors.length || !preview.rows.length} onClick={() => void action(importPeople)}>Guardar personas en FNET</button> <button disabled={busy} onClick={() => setPreview(null)}>Cancelar importación</button></section>}
    <section className={s.filters} aria-label="Filtros de auditorías"><label>Buscar<input value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })} placeholder="Persona, localidad o nota" /></label><label>Sector / zona<select value={filters.sector} onChange={e => setFilters({ ...filters, sector: e.target.value })}><option value="">Todos</option>{sectors.map(v => <option key={v}>{v}</option>)}</select></label><label>Estado<select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="">Todos</option>{AUDIT_STATES.map(v => <option key={v}>{v}</option>)}</select></label><label>Vencimiento<select value={filters.due} onChange={e => setFilters({ ...filters, due: e.target.value })}><option value="">Todos</option>{['Vencida', 'Vence hoy', 'Próxima', 'Vigente', 'Sin fecha', 'Exenta'].map(v => <option key={v}>{v}</option>)}</select></label><label>Avisar con<select value={filters.warningDays} onChange={e => setFilters({ ...filters, warningDays: Number(e.target.value) })}>{[7, 15, 30, 60].map(n => <option key={n} value={n}>{n} días</option>)}</select></label><button onClick={() => setFilters({ ...FILTERS })}>Limpiar</button></section>
    <section className={s.panel}><h2>{visible.length} de {rows.length} personas</h2><div className={s.tableWrap}><table><thead><tr><th>Persona / rol</th><th>Sector / localidad</th><th>Estado</th><th>Última</th><th>Próxima</th><th>Aviso</th><th>Acciones</th></tr></thead><tbody>{visible.map(r => <tr key={r.id}><td><strong>{r.name}</strong><small>{r.role}</small></td><td>{r.sector}<small>{r.location}</small></td><td>{r.status}</td><td>{fmt(r.lastDate)}</td><td>{fmt(r.nextDate)}</td><td><span className={s.badge} data-due={auditDue(r, today, filters.warningDays)}>{auditDue(r, today, filters.warningDays)}</span></td><td><div className={s.actions}><button onClick={() => { setSelected(r); setEditor(false); }}>Historial y archivos</button>{canEdit && <><button disabled={busy} onClick={() => openEditor(r)}>Editar</button><button className={s.primary} disabled={busy} onClick={() => openEditor(r, true)}>Registrar auditoría</button></>}</div></td></tr>)}</tbody></table></div>{!visible.length && <p>No hay personas para estos filtros. La lista solo muestra registros guardados en FNET.</p>}</section>
    {(selected || editor) && <section ref={detailPanel} className={s.panel} aria-label="Ficha de auditoría"><div className={s.heading}><h2>{editor ? selected ? kind === 'AUDIT' ? 'Registrar nueva auditoría' : 'Editar persona' : 'Agregar persona' : selected?.name}</h2><button disabled={busy} onClick={() => { setEditor(false); setSelected(null); }}>Cerrar ficha</button></div>
      {editor && canEdit && <form onSubmit={e => { e.preventDefault(); void action(save); }}><div className={s.formGrid}>
        {!selected && <label>CUIL<input required pattern="[0-9 -]{11,15}" value={cuil} onChange={e => { setCuil(e.target.value); requestId.current = crypto.randomUUID(); }} /></label>}
        {(['name', 'role', 'sector', 'location'] as const).map((key, i) => <label key={key}>{['Nombre completo', 'Rol / cuadrilla', 'Sector / zona', 'Localidad'][i]}<input required={key === 'name' || key === 'sector'} maxLength={key === 'name' ? 250 : 100} value={data[key]} onChange={e => { setData({ ...data, [key]: e.target.value }); requestId.current = crypto.randomUUID(); }} /></label>)}
        <label>Estado<select value={data.status} disabled={kind === 'AUDIT'} onChange={e => { setData({ ...data, status: e.target.value as AuditData['status'] }); requestId.current = crypto.randomUUID(); }}>{AUDIT_STATES.map(v => <option key={v}>{v}</option>)}</select></label>
        <label>Fecha de auditoría<input type="date" value={data.lastDate} required={kind === 'AUDIT'} onChange={e => { setData({ ...data, lastDate: e.target.value, nextDate: nextAuditDate(e.target.value), exception: '' }); requestId.current = crypto.randomUUID(); }} /></label>
        <label>Próxima auditoría<input type="date" min={data.lastDate || undefined} value={data.nextDate} onChange={e => { setData({ ...data, nextDate: e.target.value }); requestId.current = crypto.randomUUID(); }} /></label>
        <label>Motivo de excepción<input value={data.exception} maxLength={1000} required={!!data.lastDate && !!data.nextDate && data.nextDate !== nextAuditDate(data.lastDate)} onChange={e => { setData({ ...data, exception: e.target.value }); requestId.current = crypto.randomUUID(); }} placeholder="Si la próxima fecha no es a 3 meses" /></label>
      </div><label>Observaciones / referencia de correo<textarea rows={3} value={data.notes} maxLength={10000} onChange={e => { setData({ ...data, notes: e.target.value }); requestId.current = crypto.randomUUID(); }} /></label><p className={s.hint}>Se guarda autor, fecha e historial. Después de guardar podés adjuntar Excel, PDF y fotos.</p><button type="submit" className={s.primary} disabled={busy}>Guardar registro</button></form>}
      {selected && <><h3>Historial y archivos</h3>{historyLoading && <p>Consultando historial…</p>}{historyError && <><p role="alert" className={s.error}>{historyError}</p><button onClick={() => setHistoryAttempt(n => n + 1)}>Reintentar historial</button></>}
        {canEdit && !historyLoading && !historyError && history.length > 0 && <div className={s.upload}><label>Adjuntar al registro<select value={fileRecord} onChange={e => setFileRecord(e.target.value)}>{history.map(r => <option key={r.id} value={r.id}>#{r.version} · {r.kind === 'AUDIT' ? 'Auditoría' : r.kind === 'IMPORT' ? 'Importación' : 'Edición'} · {fmt(r.data.lastDate)}</option>)}</select></label><label className={s.fileButton}>Adjuntar Excel, PDF o fotos<input aria-label="Adjuntar archivos de auditoría" type="file" multiple accept=".xlsx,.pdf,image/jpeg,image/png,image/webp" disabled={busy || !fileRecord} onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void action(() => upload(files)); }} /></label><small>Hasta 8 MB por archivo, 20 archivos y 48 MB por registro. Los adjuntos son privados, no enlaces públicos.</small></div>}
        {history.map(r => <article key={r.id} className={s.record}><h4>#{r.version} · {r.kind === 'AUDIT' ? 'Auditoría realizada' : r.kind === 'IMPORT' ? 'Datos importados' : 'Cambio registrado'} · {r.data.status}</h4><p>{r.actor_name} · {new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(r.created_at))}</p><p>Última: {fmt(r.data.lastDate)} · Próxima: {fmt(r.data.nextDate)}</p>{r.data.exception && <p>Excepción: {r.data.exception}</p>}<p className={s.notes}>{r.data.notes || 'Sin observaciones'}</p><ul>{r.files.map(f => <li key={f.id}><a href={`/api/auditorias/files?id=${f.id}`}>{f.file_name}</a> <small>{Math.ceil(f.byte_count / 1024)} KB · {f.actor_name}</small></li>)}</ul>{!r.files.length && <small>Sin archivos adjuntos en este registro.</small>}</article>)}
      </>}
    </section>}
  </main>;
}
