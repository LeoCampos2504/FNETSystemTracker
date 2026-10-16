"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { assignTrayPersonZone, decorateTrayRows, EMPTY_TRAY_FILTERS, filterTray, hasTraySignature, parseTrayCsv, parseZoneSheet, trayDate, trayMessage, trayMoney, type TrayFilters, type TrayRow, type ZoneEntry } from "@/lib/mendel-bandeja";
import { drawTrayPrint } from "@/lib/mendel-tray-print";
import styles from "./mendel-zone-tray.module.css";
import { MendelDateRange } from "./mendel-date-range";
import { decisionLabel, publishZoneRows, ZoneAccessEditor, ZoneDecisionEditor, type ZoneCatalog } from "./mendel-zone-actions";

const PAGE_SIZE = 50, PRINT_SIZE = 10;
const values = (list: string[]) => [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));

function Modal({ title, onClose, children, issue }: { title: string; onClose: () => void; children: ReactNode; issue?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog className={styles.dialog} ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2>{title}</h2><button type="button" onClick={onClose}>Cerrar</button></header><div className={styles.dialogBody}>{issue && <p className={styles.error} role="alert">{issue}</p>}{children}</div>
  </dialog>;
}

export function MendelZoneTray({ admin = false }: { admin?: boolean }) {
  const [catalog, setCatalog] = useState<ZoneCatalog>({ rows: [], users: [], grants: [] });
  const [decisionFilter, setDecisionFilter] = useState("");
  const [sourceRows, setSourceRows] = useState<TrayRow[]>([]);
  const [source, setSource] = useState("");
  const [notesAvailable, setNotesAvailable] = useState(false);
  const [directory, setDirectory] = useState<ZoneEntry[]>([]);
  const [directoryFile, setDirectoryFile] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState<TrayFilters>({ ...EMPTY_TRAY_FILTERS });
  const [page, setPage] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  const [modal, setModal] = useState<"detail" | "assign" | "message" | "print" | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [assignPerson, setAssignPerson] = useState(""), [assignZone, setAssignZone] = useState("");
  const [message, setMessage] = useState(""), [imageUrl, setImageUrl] = useState(""), [imagePage, setImagePage] = useState(0);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const rows = useMemo(() => decorateTrayRows(sourceRows, directory, overrides), [sourceRows, directory, overrides]);
  const visible = useMemo(() => filterTray(rows, { ...filters, hideSigned: filters.hideSigned && notesAvailable }).filter(row => !decisionFilter || (row.internalDecision || "PENDIENTE") === decisionFilter), [rows, filters, notesAvailable, decisionFilter]);
  const selected = rows.find(row => row.key === selectedKey);
  const zones = values(rows.map(row => row.zone)), people = values(rows.map(row => row.person)), budgets = values(rows.map(row => row.budget));
  const hidden = filters.hideSigned && notesAvailable ? rows.filter(hasTraySignature).length : 0;
  const unassigned = rows.filter(row => !row.zone).length;
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE)), currentPage = Math.min(page, pages - 1);
  const title = filters.zone && filters.zone !== "__UNASSIGNED__" ? `Zona ${filters.zone}` : "Bandeja de control";
  useEffect(() => {
    let live = true;
    void fetch("/api/mendel/zone-control", { cache: "no-store" }).then(async response => { if (!response.ok) throw new Error("No se pudo cargar el control compartido. No se mostraron datos demo."); return response.json() as Promise<ZoneCatalog>; }).then(result => { if (live) { setCatalog(result); setSourceRows(result.rows); setSource("Control compartido FNET"); setNotesAvailable(true); } }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);

  function filter<K extends keyof TrayFilters>(key: K, value: TrayFilters[K]) { setFilters(previous => ({ ...previous, [key]: value })); setPage(0); }
  function replaceData(next: TrayRow[], label: string, hasNotes: boolean) {
    if (Object.keys(overrides).length && !window.confirm("Al reemplazar los datos se pierden las zonas manuales de esta sesión. ¿Continuar?")) return;
    setSourceRows(next); setSource(label); setNotesAvailable(hasNotes); setOverrides({}); setFilters({ ...EMPTY_TRAY_FILTERS }); setPage(0); setModal(null); setImageUrl(""); setStatus(`Cargados ${next.length} gastos. No se modificó Mendel ni la base de datos.`);
  }
  async function loadCsv(file: File | undefined) {
    if (!file) return; setBusy(true); setError("");
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error("El CSV supera 15 MB. Exportá un período más corto.");
      const bytes = await file.arrayBuffer(); let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { text = new TextDecoder("windows-1252").decode(bytes); }
      const result = parseTrayCsv(text); replaceData(result.rows, `CSV local: ${file.name} (no se subió al servidor)`, result.notesAvailable);
    } catch (e) { setError(`${e instanceof Error ? e.message : "No se pudo leer el CSV."} Se conservan los datos anteriores.`); } finally { setBusy(false); }
  }
  async function loadRegistry(force = false) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/mendel/zone-control", { cache: "no-store" });
      const result = await response.json() as ZoneCatalog & { code?: string };
      if (!response.ok) throw new Error(response.status === 401 ? "Tu sesión venció. Volvé a ingresar." : response.status === 403 ? "Tu cuenta no tiene acceso a esta bandeja." : result.code === "DATASET_TOO_LARGE" ? "El registro supera 5.000 gastos. Usá un CSV de un período más corto; no se mostraron datos parciales." : "El registro FNET no está disponible. No se cargaron datos demo.");
      setCatalog(result);
      if (force) { setSourceRows(result.rows); setSource("Control compartido FNET"); setNotesAvailable(true); setOverrides({}); setModal(null); }
      else replaceData(result.rows, "Control compartido FNET", true);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo consultar el registro."); } finally { setBusy(false); }
  }
  async function loadDirectory(file: File | undefined) {
    if (!file) return; setBusy(true); setError("");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("La planilla de zonas supera 5 MB.");
      const { readSheet } = await import("read-excel-file/browser");
      const result = parseZoneSheet(await readSheet(file));
      if (!result.length) throw new Error("No hay personas con operación informada en esta planilla.");
      setDirectory(result); setDirectoryFile(file.name); setStatus(`Planilla de zonas cargada: ${result.length} personas. No se incorporó el archivo al repositorio.`);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo leer la planilla."); } finally { setBusy(false); }
  }
  async function publish() {
    if (!window.confirm(`Se compartirán ${visible.length} gastos con las cuentas habilitadas para sus zonas. Incluye las notas. ¿Continuar?`)) return;
    setBusy(true); setError(""); let saved = 0;
    try { await publishZoneRows(visible, count => { saved = count; setStatus(`${count} gastos compartidos…`); }); await loadRegistry(true); setStatus(`${saved} gastos compartidos. Ya pueden responder los coordinadores habilitados.`); }
    catch (e) { setError(`${e instanceof Error ? e.message : "No se pudo compartir."} ${saved} gastos guardados; los restantes no se guardaron. Podés reintentar sin duplicarlos.`); }
    finally { setBusy(false); }
  }
  function assign(person: string) {
    try {
      setOverrides(assignTrayPersonZone(sourceRows, overrides, person, assignZone));
      setStatus(`Zona ${assignZone.trim()} aplicada a los ${rows.filter(row => row.person === person).length} consumos de ${person}, incluidos los ocultos por filtros.`); setModal(null); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Revisá la zona."); }
  }
  function openDetail(row: TrayRow) { setError(""); setSelectedKey(row.key); setAssignZone(row.zone); setModal("detail"); }
  function openMessage() { setMessage(trayMessage(visible, title)); setModal("message"); }
  async function copyMessage() {
    try { await navigator.clipboard.writeText(message); setStatus("Mensaje copiado. Revisalo antes de enviarlo."); }
    catch { const element = document.getElementById("tray-message") as HTMLTextAreaElement | null; element?.focus(); element?.select(); setStatus("Seleccionado: presioná Ctrl+C para copiar."); }
  }
  function makeImage(nextPage: number) {
    try { canvas.current = drawTrayPrint(visible.slice(nextPage * PRINT_SIZE, (nextPage + 1) * PRINT_SIZE), filters.zone, nextPage, Math.ceil(visible.length / PRINT_SIZE), source.startsWith("CSV") ? "CSV local" : "Registro FNET (CSV)"); setImageUrl(canvas.current.toDataURL("image/png")); setImagePage(nextPage); setModal("print"); setError(""); }
    catch (e) { canvas.current = null; setImageUrl(""); setImagePage(nextPage); setModal("print"); setError(e instanceof Error ? e.message : "No se pudo generar el print."); }
  }
  function downloadImage() {
    canvas.current?.toBlob(blob => { if (!blob) { setError("No se pudo generar el PNG."); return; } const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `Mendel-${filters.zone.replace(/[^a-zA-Z0-9_-]/g, "_")}-print-${imagePage + 1}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }, "image/png");
  }

  return <main className={styles.page}>
    <header className={styles.heading}><div><Link href="/compras">← Registro de compras</Link><p>FNET · Control Mendel</p><h1>Rendiciones por zona</h1><p>Comprobantes y consultas para coordinación, sin cambiar estados oficiales.</p></div><div className={styles.actions}>
      {admin && <label className={styles.fileButton}>Cargar CSV<input aria-label="Cargar CSV de gastos" type="file" accept=".csv,.tsv" disabled={busy} onChange={event => { void loadCsv(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>}
      <button type="button" disabled={busy} onClick={() => void loadRegistry()}>Cargar control compartido</button>
      {admin && <label className={styles.fileButton}>Cargar planilla de zonas<input aria-label="Cargar planilla de zonas" type="file" accept=".xlsx" disabled={busy} onChange={event => { void loadDirectory(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>}
      {admin && <button type="button" className={styles.primary} disabled={busy || !visible.length} onClick={() => void publish()}>Compartir {visible.length} gastos filtrados</button>}
    </div></header>
    <p className={styles.source}><strong>Fuente:</strong> {source || "Elegí un CSV real o el registro importado de FNET. No hay datos demo."}<br />{directoryFile ? `Zonas: ${directoryFile}. Se usa Operación para agrupar y Zona como localidad.` : "Cargá la planilla de zonas o asignalas manualmente. No se deducen del presupuesto."}</p>
    <p className={styles.notice}>No hay conexión automática a Mendel. El CSV y el Excel se leen en tu navegador hasta que Admin elige Compartir. Solo entonces se guardan los gastos filtrados en el control interno FNET. Las respuestas de coordinación NO aprueban ni rechazan gastos en Mendel.</p>
    {admin && <ZoneAccessEditor catalog={catalog} onSaved={loadRegistry} />}
    {error && <p className={styles.error} role="alert">{error}</p>}{busy && <p role="status">Procesando…</p>}<p className={styles.status} role="status">{status}</p>
    {!!source && !notesAvailable && <p className={styles.notice}>Esta fuente no tiene notas disponibles: NO se puede aplicar la exclusión por comentario. Para revisar y ocultar esas filas, cargá un CSV que incluya Notas. No se asumió que los comentarios estuvieran vacíos.</p>}
    <section className={styles.workspace}>
      <div className={styles.filters}>
        <label>Buscar<input aria-label="Buscar en la bandeja" value={filters.query} onChange={event => filter("query", event.target.value)} placeholder="Persona, comercio, nota o FO" /></label>
        <label>Zona / operación<select aria-label="Filtrar zona" value={filters.zone} onChange={event => filter("zone", event.target.value)}><option value="">Todas</option>{zones.map(zone => <option key={zone}>{zone}</option>)}{!!unassigned && <option value="__UNASSIGNED__">Sin zona</option>}</select></label>
        <label>Persona<select aria-label="Filtrar persona" value={filters.person} onChange={event => filter("person", event.target.value)}><option value="">Todas</option>{people.map(person => <option key={person}>{person}</option>)}</select></label>
        <label>Presupuesto<select aria-label="Filtrar presupuesto" value={filters.budget} onChange={event => filter("budget", event.target.value)}><option value="">Todos</option>{budgets.map(budget => <option key={budget}>{budget}</option>)}</select></label>
        <label>Hay ticket<select aria-label="Filtrar ticket" value={filters.receipt} onChange={event => filter("receipt", event.target.value)}><option value="">Todos</option><option value="NO">No · pedir comprobante</option><option value="SI">Sí</option><option value="SIN_DATO">Sin dato</option></select></label>
        <MendelDateRange from={filters.from} to={filters.to} onChange={range => { setFilters(previous => ({ ...previous, ...range })); setPage(0); }} />
        <label>Confirmación de coordinación<select aria-label="Filtrar confirmación interna" value={decisionFilter} onChange={e => { setDecisionFilter(e.target.value); setPage(0); }}><option value="">Todas</option><option value="PENDIENTE">Pendiente de confirmar</option><option value="AUTORIZADO">Autorizado</option><option value="NO_AUTORIZADO">No autorizado</option></select></label>
      </div>
      <div className={styles.toolbar}><label className={styles.check}><input type="checkbox" checked={filters.hideSigned} disabled={!notesAvailable} onChange={event => filter("hideSigned", event.target.checked)} />Ocultar comentarios “Eugenia Salto” / “Salto Eugenia”</label><button type="button" onClick={() => { setFilters({ ...EMPTY_TRAY_FILTERS }); setDecisionFilter(""); setPage(0); }}>Limpiar filtros</button>{admin && <button type="button" disabled={!people.length} onClick={() => { setAssignPerson(filters.person || ""); setAssignZone(""); setModal("assign"); }}>Asignar zona a persona</button>}</div>
      <div className={styles.zones}>{zones.map(zone => <button type="button" aria-pressed={filters.zone === zone} key={zone} onClick={() => filter("zone", filters.zone === zone ? "" : zone)}>{zone}</button>)}{!!unassigned && <button type="button" onClick={() => filter("zone", "__UNASSIGNED__")}>Sin zona · {unassigned}</button>}</div>
      <div className={styles.tableHeading}><div><h2>{title}</h2><p>{source ? `${visible.length} gastos filtrados de ${rows.length} · ${notesAvailable ? `${hidden} ocultos por comentario` : "exclusión por comentario no disponible"}` : "Sin datos cargados"}</p></div><div className={styles.actions}><button type="button" disabled={!visible.length} onClick={openMessage}>Copiar consulta</button><button type="button" className={styles.primary} disabled={!visible.length || !filters.zone || filters.zone === "__UNASSIGNED__"} onClick={() => makeImage(0)}>Armar print de esta zona</button></div></div>
      {!visible.length ? <div className={styles.empty}>{source ? "Ningún gasto coincide con los filtros." : "Cargá datos reales para comenzar."}</div> : <>
        <div className={styles.tableScroll}><table><thead><tr>{["Fecha", "Zona", "Usuario", "Comercio", "Total", "Presupuesto", "Notas", "Hay ticket", "Confirmación", "Detalle"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(row => <tr key={row.key}><td>{trayDate(row.date)}</td><td>{row.zone || "Sin zona"}</td><td>{row.person || "Sin persona"}</td><td>{row.merchant}</td><td className={styles.amount}>{trayMoney(row.amount, row.currency)}</td><td>{row.budget}</td><td><div className={styles.notePreview}>{row.notes ?? "No disponible"}</div></td><td><span className={row.receipt === "NO" ? styles.missing : styles.badge}>{row.receipt === "SI" ? "Sí" : row.receipt === "NO" ? "No" : "Sin dato"}</span></td><td><strong>{row.revision ? decisionLabel(row.internalDecision) : "Sin compartir"}</strong><small>{row.decisionActor}</small>{row.needsReconfirmation && <small>Dato actualizado: revisar</small>}</td><td><button type="button" onClick={() => openDetail(row)}>Ver detalle</button></td></tr>)}</tbody></table></div>
        <div className={styles.cards}>{visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map(row => <article key={row.key}><header><strong>{row.person || "Sin persona"}</strong><strong>{trayMoney(row.amount, row.currency)}</strong></header><p>{trayDate(row.date)} · {row.zone || "Sin zona"} · {row.merchant}</p><p>{row.budget} · Ticket: {row.receipt === "SI" ? "Sí" : row.receipt === "NO" ? "No" : "Sin dato"}</p><div className={styles.notePreview}>{row.notes ?? "Notas no disponibles"}</div><p>{row.revision ? decisionLabel(row.internalDecision) : "Sin compartir"} · {row.decisionActor}</p><button type="button" onClick={() => openDetail(row)}>Ver detalle</button></article>)}</div>
        <div className={styles.pager}><span>Página {currentPage + 1} de {pages}</span><button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Anterior</button><button type="button" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Siguiente</button></div>
      </>}
    </section>
    <p className={styles.footnote}>Acceso real validado en servidor. Cada coordinador ve solo zonas habilitadas por Admin. El CSV y las zonas manuales se pierden al recargar hasta compartir los gastos; las respuestas compartidas quedan guardadas con autor, fecha e historial. No se interpreta un comentario como aprobación oficial. Revisá los datos personales antes de compartir un PNG.</p>
    {modal === "detail" && selected && <Modal issue={error} title="Detalle del gasto" onClose={() => setModal(null)}><dl className={styles.facts}>{[["Usuario", selected.person], ["Comercio", selected.merchant], ["Fecha", trayDate(selected.date)], ["Total", trayMoney(selected.amount, selected.currency)], ["Zona", selected.zone], ["Fuente zona", selected.zoneSource], ["Localidad de origen", selected.locality], ["Coordinador de origen", selected.coordinator], ["Estado del pago (no aprobación)", selected.paymentStatus], ["Aprobación oficial", selected.officialApproval || "No disponible en esta fuente"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Sin dato"}</dd></div>)}</dl><ZoneDecisionEditor key={selected.transactionId + String(selected.revision)} row={selected} onSaved={async () => { setModal(null); await loadRegistry(); }} /><h3>Nota de la transacción</h3><div className={styles.fullNote}>{selected.notes ?? "Notas no disponibles"}</div>{selected.approvalNotes && <><h3>Nota de aprobación de la fuente</h3><div className={styles.fullNote}>{selected.approvalNotes}</div></>}{admin && <><label className={styles.field}>Zona de esta persona<input aria-label="Zona para todos sus consumos" maxLength={80} value={assignZone} onChange={event => setAssignZone(event.target.value)} /></label><p>Aplica a todos los {rows.filter(row => row.person === selected.person).length} consumos del mismo nombre, incluso ocultos por filtros.</p><button type="button" disabled={!selected.person} className={styles.primary} onClick={() => assign(selected.person)}>Asignar a todos sus consumos</button></>}</Modal>}
    {modal === "assign" && <Modal issue={error} title="Asignar zona a persona" onClose={() => setModal(null)}><label className={styles.field}>Persona<select aria-label="Persona a asignar" value={assignPerson} onChange={event => setAssignPerson(event.target.value)}><option value="">Elegí una persona</option>{people.map(person => <option key={person}>{person}</option>)}</select></label><label className={styles.field}>Zona<input aria-label="Zona a asignar" maxLength={80} value={assignZone} onChange={event => setAssignZone(event.target.value)} /></label><p>Reemplaza la zona de TODOS sus consumos del archivo, incluidos los ocultos. Solo en esta sesión.</p><button type="button" className={styles.primary} onClick={() => assign(assignPerson)}>Asignar a todos sus consumos</button></Modal>}
    {modal === "message" && <Modal issue={error} title="Consulta para coordinación" onClose={() => setModal(null)}><p>Revisá y copiá el mensaje; no se envía automáticamente ni incluye notas personales.</p><textarea id="tray-message" className={styles.message} value={message} readOnly aria-label="Mensaje para coordinación" /><button type="button" onClick={() => void copyMessage()}>Copiar mensaje</button></Modal>}
    {modal === "print" && <Modal issue={error} title={`Print · ${title}`} onClose={() => setModal(null)}><p>Hasta 10 gastos por imagen, notas completas. Revisá antes de compartir.</p><div className={styles.actions}><button type="button" disabled={!imagePage} onClick={() => makeImage(imagePage - 1)}>Anterior imagen</button><span>Imagen {imagePage + 1} de {Math.ceil(visible.length / PRINT_SIZE)}</span><button type="button" disabled={imagePage + 1 >= Math.ceil(visible.length / PRINT_SIZE)} onClick={() => makeImage(imagePage + 1)}>Siguiente imagen</button><button type="button" className={styles.primary} disabled={!imageUrl} onClick={downloadImage}>Descargar PNG</button></div>{/* Local Canvas preview; no remote image optimization or upload. */}{/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.preview} src={imageUrl} alt="Print de los gastos filtrados por zona" /></Modal>}
  </main>;
}
