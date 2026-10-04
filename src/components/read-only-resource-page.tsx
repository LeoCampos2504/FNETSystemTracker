"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { SytexSupplyImport } from "./sytex-supply-import";

type ResourceKind = "correctivos" | "preventivos" | "cotizaciones" | "insumos";
type ResourceItem = Record<string, unknown>;
type MendelCandidate = { transactionId: string; transactionDate: string; merchant: string | null; totalAmount: string; currency: string; hasReceipt: boolean | null };
type MendelMatch = { status: string; candidateCount: number; candidates: MendelCandidate[] };
type MendelSummary = { totalTransactions: number; matchedSupplies: number; ambiguousSupplies: number; unmatchedSupplies: number; totalForms: number; relatedForms: number; transactionsWithFormReferences: number };
type Synchronization = { oldestAt: string | null; latestAt: string | null };
type ExportDetails = { id: string; fileName: string; importedAt: string; answerCount: number; formCount: number; sourceEditedFrom: string | null; sourceEditedThrough: string | null };
type ResourcePayload = { count: number; items: ResourceItem[]; mendelSummary?: MendelSummary; synchronization?: Synchronization; exportDetails?: ExportDetails | null };

const resourceConfig: Record<ResourceKind, { title: string; description: string; columns: Array<[string, string]> }> = {
  correctivos: { title: "Correctivos", description: "Registros oficiales sincronizados desde Sytex.", columns: [["codigo", "Código"], ["description", "Descripción"], ["status", "Estado"], ["project", "Proyecto"], ["site", "Sitios afectados"]] },
  preventivos: { title: "Preventivos", description: "Registros oficiales sincronizados desde Sytex.", columns: [["codigo", "Código"], ["description", "Descripción"], ["status", "Estado"], ["project", "Proyecto"], ["site", "Sitios afectados"]] },
  cotizaciones: { title: "Cotizaciones", description: "Cotizaciones oficiales; el vínculo se muestra solo si coincide el código de tarea.", columns: [["code", "Código"], ["status", "Estado"], ["taskCode", "Código de tarea"], ["relatedCorrectiveCode", "Correctivo relacionado"], ["total", "Total"]] },
  insumos: { title: "Insumos", description: "Materiales informados en Sytex y compras de Mendel que referencian el mismo formulario.", columns: [["formulario", "Formulario"], ["group", "Grupo"], ["index", "Índice"], ["description", "Descripción"], ["quantity", "Cantidad informada"], ["site", "Sitio"], ["technician", "Técnico asignado"], ["lastEditedBy", "Última edición por"], ["image", "Imagen"], ["mendel", "Compras relacionadas"]] },
};
const PAGE_SIZE = 50;
function normalized(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function dateLabel(value: string | null): string {
  if (!value) return "Sin fecha informada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha informada" : date.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}
function displayValue(item: ResourceItem, key: string): string {
  const value = item[key];
  if (key === "description") return String(item.description ?? "Sin descripción informada");
  if (key === "status") return String(value ?? "Sin estado");
  if (key === "codigo") return String(item.taskCode ?? item.codigo ?? "—");
  if (key === "project") return String(item.zoneId ?? item.projectId ?? "Sin proyecto informado");
  if (key === "site") return [item.siteCode, item.siteName].filter(Boolean).join(" / ") || "Sin sitio informado";
  if (key === "group") return String(item.grupo ?? "—");
  if (key === "index") return String(item.indice ?? "—");
  if (key === "technician") return String(item.technician ?? "Sin asignación informada");
  if (key === "lastEditedBy") return String(item.lastEditedBy ?? "Sin editor informado");
  if (key === "mendel") {
    const match = item.mendel as MendelMatch | undefined;
    return match?.candidateCount ? `${match.candidateCount} compra(s) para este FO` : "Sin referencia FO";
  }
  if (key === "total") return item.total ? `${item.total} ${item.currency ?? ""}`.trim() : "—";
  return value === null || value === undefined || value === "" ? "—" : String(value);
}
function cellValue(item: ResourceItem, key: string): ReactNode {
  if (key === "mendel") {
    const match = item.mendel as MendelMatch | undefined;
    if (!match?.candidateCount) return "Sin referencia FO";
    return <details className="resource-purchase-details"><summary>{displayValue(item, key)} · revisar</summary>
      <p>La referencia al formulario no confirma el consumo de este material.</p>
      <ul>{match.candidates.map((purchase) => <li key={purchase.transactionId}>
        <strong>{purchase.merchant ?? "Comercio sin informar"}</strong>
        <span>{purchase.totalAmount} {purchase.currency} · {dateLabel(purchase.transactionDate)}</span>
        <span>Transacción: {purchase.transactionId}</span>
        <span>{purchase.hasReceipt === true ? "Mendel declara comprobante" : purchase.hasReceipt === false ? "Mendel declara sin comprobante" : "Comprobante sin informar"}</span>
      </li>)}</ul><a href="/compras">Ver compras de Mendel</a>
    </details>;
  }
  if (key !== "image") return displayValue(item, key);
  const image = String(item.image ?? "").trim();
  try {
    const url = new URL(image);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return <a href={image} target="_blank" rel="noreferrer">Ver imagen</a>;
  } catch { /* A non-URL answer does not provide an image file. */ }
  return item.imageDeclared ? "Foto declarada; archivo pendiente" : "Sin archivo de imagen";
}

export function ReadOnlyResourcePage({ resource }: { resource: ResourceKind }) {
  const config = resourceConfig[resource];
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [mendelSummary, setMendelSummary] = useState<MendelSummary | null>(null);
  const [synchronization, setSynchronization] = useState<Synchronization | null>(null);
  const [exportDetails, setExportDetails] = useState<ExportDetails | null>(null);
  const [source, setSource] = useState<"postgresql" | "export">("postgresql");
  const [importId, setImportId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const endpoint = resource === "insumos" && source === "export" ? `/api/insumos/export${importId ? `?importId=${encodeURIComponent(importId)}` : ""}` : `/api/${resource}`;
    void fetch(endpoint, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("database_unavailable");
      return response.json() as Promise<ResourcePayload>;
    }).then((data) => {
      if (cancelled) return;
      setItems(data.items); setCount(data.count); setMendelSummary(data.mendelSummary ?? null);
      setSynchronization(data.synchronization ?? null); setPage(1); setState("ready");
      setExportDetails(data.exportDetails ?? null);
    }).catch(() => {
      if (cancelled) return;
      setItems([]); setCount(null); setMendelSummary(null); setSynchronization(null); setState("error");
      setExportDetails(null);
    });
    return () => { cancelled = true; };
  }, [resource, reloadToken, source, importId]);

  const query = normalized(search.trim());
  const filtered = query ? items.filter((item) => normalized(config.columns.map(([key]) => displayValue(item, key)).join(" ")).includes(query)) : items;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const refresh = () => { setState("loading"); setReloadToken((value) => value + 1); };

  return <main className="standalone-resource-page">
    <div className="standalone-resource-header"><div><p className="eyebrow">FNET System Tracker</p><h1>{config.title}</h1><p className="page-subtitle">{config.description}</p></div><div className="data-source-tag"><span className="signal-dot" /> {resource === "insumos" && source === "export" ? "Export Sytex importado" : "Registros oficiales"}</div></div>
    {resource === "insumos" && <>
      <SytexSupplyImport onImported={(id) => { setState("loading"); setSource("export"); setImportId(id); setReloadToken((value) => value + 1); }} />
      <div className="resource-source-controls resource-source-selector"><label>Fuente de consulta <select value={source} onChange={(event) => { setState("loading"); setSource(event.target.value as "postgresql" | "export"); setImportId(null); }}><option value="postgresql">Sincronización n8n</option><option value="export">Último export cargado</option></select></label></div>
    </>}
    {state === "error" && <div className="urgent-banner"><div className="urgent-symbol"><AlertTriangle size={20} /></div><div><strong>No se pudieron consultar los datos</strong><span>Reintentá la consulta. Si el problema continúa, revisá el acceso al sistema.</span></div><button onClick={refresh}>Reintentar <RefreshCw size={15} /></button></div>}
    <div className="resource-summary"><div className="summary-card accent-blue"><span>Total de registros</span><strong>{count ?? "—"}</strong><small>{state === "ready" ? "datos consultados" : "esperando respuesta"}</small></div>
      {resource === "insumos" && mendelSummary && <div className="summary-card accent-green"><span>Formularios con compras relacionadas</span><strong>{mendelSummary.relatedForms} / {mendelSummary.totalForms}</strong><small>Referencias FO pendientes de revisión</small></div>}
      <div className="read-only-note"><ShieldCheck size={15} /> Los registros oficiales se consultan sin modificar existencias.</div>
    </div>
    {resource === "insumos" && synchronization && <p className="resource-sync-note">Sincronización de los registros: {dateLabel(synchronization.oldestAt)} — {dateLabel(synchronization.latestAt)}</p>}
    {resource === "insumos" && exportDetails && <div className="resource-sync-note"><p>Export: {exportDetails.fileName} · cargado el {dateLabel(exportDetails.importedAt)}. Contiene {exportDetails.answerCount.toLocaleString("es-AR")} respuestas de {exportDetails.formCount} formularios; la tabla muestra sus insumos identificados.</p><p>Ediciones informadas por Sytex: {exportDetails.sourceEditedFrom?.replace("T", " ") ?? "sin fecha"} — {exportDetails.sourceEditedThrough?.replace("T", " ") ?? "sin fecha"} (horario del archivo).</p></div>}
    {resource === "insumos" && source === "export" && state === "ready" && !exportDetails && <p className="resource-sync-note">Todavía no hay un export guardado. Cargá el Excel de respuestas para consultarlo aquí.</p>}
    {resource === "insumos" && mendelSummary && mendelSummary.totalTransactions > 0 && mendelSummary.transactionsWithFormReferences === 0 && <p className="resource-sync-note">No hay referencias FO importadas desde las notas de Mendel. Volvé a importar el CSV original para incorporar esas referencias.</p>}
    <section className="panel table-panel"><div className="table-toolbar"><div><p className="eyebrow">Datos consultados</p><h2>{config.title}</h2></div><span className="toolbar-spacer" />
      <label className="search-field"><input aria-label="Buscar registros" placeholder="Formulario, material, sitio o técnico" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      <button className="button secondary small" disabled={state === "loading"} onClick={refresh}><RefreshCw size={15} /> Consultar de nuevo</button>
    </div><div className="resource-table-scroll"><table className={`resource-records-table ${resource === "insumos" ? "resource-supplies-table" : ""}`}>
      <thead><tr>{config.columns.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
      <tbody>{state === "loading" ? <tr><td colSpan={config.columns.length}>Consultando registros…</td></tr> : visible.length === 0 ? <tr><td colSpan={config.columns.length}>{query ? "No hay resultados para esta búsqueda." : "No hay registros accesibles."}</td></tr> : visible.map((item, index) => <tr key={String(item.id ?? `${resource}-${(currentPage - 1) * PAGE_SIZE + index}`)}>{config.columns.map(([key]) => <td key={key} className={key === "description" ? "resource-description-cell" : undefined}>{cellValue(item, key)}</td>)}</tr>)}</tbody>
    </table></div>
    <div className="resource-pagination"><span>{filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} de ${filtered.length}` : "0 registros"}</span>
      <button className="button secondary small" disabled={currentPage <= 1 || state !== "ready"} onClick={() => setPage(currentPage - 1)}>Anterior</button>
      <span>Página {currentPage} de {totalPages}</span>
      <button className="button secondary small" disabled={currentPage >= totalPages || state !== "ready"} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
    </div><div className="source-footnote"><ShieldCheck size={14} /> {resource === "insumos" ? "La cantidad informada en un formulario no determina el saldo que conserva un técnico." : "Fuente: registros oficiales sincronizados."}</div></section>
  </main>;
}
