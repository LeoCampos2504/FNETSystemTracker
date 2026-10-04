"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";

type ResourceKind = "correctivos" | "preventivos" | "cotizaciones" | "insumos";
type ResourceItem = Record<string, unknown>;
type MendelSummary = { totalTransactions: number; matchedSupplies: number; ambiguousSupplies: number; unmatchedSupplies: number };
type ResourcePayload = { count: number; items: ResourceItem[]; mendelSummary?: MendelSummary };

const resourceConfig: Record<ResourceKind, { title: string; description: string; columns: Array<[string, string]> }> = {
  correctivos: { title: "Correctivos", description: "Registros oficiales sincronizados desde Sytex.", columns: [["codigo", "Código"], ["description", "Descripción"], ["status", "Estado"], ["project", "Proyecto"], ["site", "Sitios afectados"]] },
  preventivos: { title: "Preventivos", description: "Registros oficiales sincronizados desde Sytex.", columns: [["codigo", "Código"], ["description", "Descripción"], ["status", "Estado"], ["project", "Proyecto"], ["site", "Sitios afectados"]] },
  cotizaciones: { title: "Cotizaciones", description: "Cotizaciones oficiales; el vínculo se muestra solo si coincide el código de tarea.", columns: [["code", "Código"], ["status", "Estado"], ["taskCode", "Código de tarea"], ["relatedCorrectiveCode", "Correctivo relacionado"], ["total", "Total"]] },
  insumos: { title: "Insumos", description: "Respuestas Sytex con cantidad, descripción, formulario, sitio, técnico/editor e imagen; Mendel se cruza solo por identificadores exactos.", columns: [["formulario", "Formulario"], ["group", "Grupo"], ["index", "Índice"], ["description", "Descripción"], ["quantity", "Cantidad"], ["site", "Sitio"], ["technician", "Técnico / editor"], ["image", "Imagen"], ["mendel", "Mendel"]] },
};

function displayValue(item: ResourceItem, key: string): string {
  const value = item[key];
  if (key === "description") return String(item.description ?? "Sin descripción informada");
  if (key === "status") return String(value ?? "Sin estado");
  if (key === "codigo") return String(item.taskCode ?? item.codigo ?? "—");
  if (key === "project") return String(item.zoneId ?? item.projectId ?? "Sin proyecto informado");
  if (key === "site") return [item.siteCode, item.siteName].filter(Boolean).join(" / ") || "Sin sitio informado";
  if (key === "group") return String(item.grupo ?? "—");
  if (key === "index") return String(item.indice ?? "—");
  if (key === "technician") return String(item.technician ?? item.lastEditedBy ?? "Sin técnico/editor informado");
  if (key === "mendel") {
    const match = item.mendel as { status?: string; transactionId?: string; candidateCount?: number } | undefined;
    if (match?.status === "MATCHED") return "Vinculado · " + String(match.transactionId ?? "");
    if (match?.status === "AMBIGUOUS") return "Ambiguo · " + String(match.candidateCount ?? 0) + " candidatos";
    return "Sin vínculo exacto";
  }
  if (key === "total") return item.total ? String(item.total) + " " + String(item.currency ?? "") : "—";
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function cellValue(item: ResourceItem, key: string): ReactNode {
  if (key !== "image") return displayValue(item, key);
  const image = String(item.image ?? "");
  if (!image) return "Sin imagen";
  if (/^https?:\/\//i.test(image)) return <a href={image} target="_blank" rel="noreferrer">Ver imagen</a>;
  return image;
}

export function ReadOnlyResourcePage({ resource }: { resource: ResourceKind }) {
  const config = resourceConfig[resource];
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [mendelSummary, setMendelSummary] = useState<MendelSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/" + resource, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("database_unavailable");
      return response.json() as Promise<ResourcePayload>;
    }).then((data) => {
      if (cancelled) return;
      setItems(data.items);
      setCount(data.count);
      setMendelSummary(data.mendelSummary ?? null);
      setState("ready");
    }).catch(() => {
      if (cancelled) return;
      setItems([]); setCount(null); setMendelSummary(null); setState("error");
    });
    return () => { cancelled = true; };
  }, [resource, reloadToken]);

  return <main className="standalone-resource-page">
    <div className="standalone-resource-header"><div><p className="eyebrow">FNET System Tracker · fuente oficial</p><h1>{config.title}</h1><p className="page-subtitle">{config.description}</p></div><div className="data-source-tag"><span className="signal-dot" /> PostgreSQL · solo lectura</div></div>
    {state === "error" && <div className="urgent-banner"><div className="urgent-symbol"><AlertTriangle size={20} /></div><div><strong>No se pudo consultar PostgreSQL</strong><span>La vista no incorpora mocks. Revisá la configuración de conexión y la conectividad desde tu PC.</span></div><button onClick={() => setReloadToken((value) => value + 1)}>Reintentar <RefreshCw size={15} /></button></div>}
    <div className="resource-summary"><div className="summary-card accent-blue"><span>Total accesible</span><strong>{count ?? "—"}</strong><small>{state === "ready" ? "consulta real" : "esperando respuesta"}</small></div><div className="summary-card accent-green"><span>Origen</span><strong>Railway</strong><small>PostgreSQL server-side</small></div><div className="read-only-note"><ShieldCheck size={15} /> Las tablas oficiales no tienen acciones de escritura.</div>{resource === "insumos" && mendelSummary && <div className="read-only-note"><ShieldCheck size={15} /> Mendel: {mendelSummary.matchedSupplies} vinculados, {mendelSummary.ambiguousSupplies} ambiguos, {mendelSummary.unmatchedSupplies} sin vínculo exacto.</div>}</div>
    <section className="panel table-panel"><div className="table-toolbar"><div><p className="eyebrow">Datos consultados</p><h2>{config.title}</h2></div><span className="toolbar-spacer" /><button className="button secondary small" onClick={() => setReloadToken((value) => value + 1)}><RefreshCw size={15} /> Actualizar</button></div><div className="data-table standalone-resource-table"><div className="data-table-head">{config.columns.map(([, label]) => <span key={label}>{label}</span>)}</div>{state === "loading" ? <div className="resource-empty">Consultando PostgreSQL…</div> : items.length === 0 ? <div className="resource-empty">No hay registros accesibles.</div> : items.slice(0, 100).map((item, index) => <div className="data-table-row" key={String(item.id ?? resource + "-" + index)}>{config.columns.map(([key]) => <span key={key} className={key === "codigo" || key === "code" || key === "formulario" ? "table-strong" : "table-muted"}>{cellValue(item, key)}</span>)}</div>)}</div><div className="source-footnote"><ShieldCheck size={14} /> Fuente: tabla oficial introspectada. Sin combinación con datos demo.</div></section>
  </main>;
}
