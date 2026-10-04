"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileUp, RefreshCw, Search, ShieldCheck } from "lucide-react";

type Purchase = {
  transactionId: string;
  transactionDate: string;
  confirmationDate: string | null;
  userName: string | null;
  merchant: string | null;
  totalAmount: string | number;
  currency: string;
  budget: string | null;
  transactionType: string | null;
  transactionStatus: string | null;
  transactionCategory: string | null;
  hasReceipt: boolean | null;
  invoiceTotal: string | number | null;
  receiptStatus: string | null;
  reconciliationStatus: string;
};
type Preview = { rowCount: number; insertedCount: number; updatedCount: number; duplicateRowsSkipped: number; invalidRows: number; errors: Array<{ line: number; fields: string[] }>; imported?: boolean; code?: string };
type ResponseData = { items: Purchase[]; total: number; page: number; summary: { totalTransactions: number; amountByCurrency: Array<{ currency: string; totalAmount: string }>; pendingReceipt: number; overdueReceipt: number; pendingReconciliation: number }; latestImport: { importedAt: string; rowCount: number; insertedCount: number; updatedCount: number } | null };

function money(value: string | number, currency: string) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: currency || "ARS", maximumFractionDigits: 2 }).format(Number(value));
}
function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}
function missingReceipt(item: Purchase) {
  return item.hasReceipt === false || (item.hasReceipt === null && (item.receiptStatus ?? "").toLocaleUpperCase("es-AR").includes("SIN COMPROBANTE"));
}
function ageDays(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

export function MendelPurchases() {
  const [data, setData] = useState<ResponseData | null>(null);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (month) {
        const [year, monthNumber] = month.split("-").map(Number);
        params.set("from", `${month}-01`);
        params.set("to", `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`);
      }
      if (overdueOnly) params.set("overdue", "true");
      params.set("page", String(page));
      const response = await fetch(`/api/mendel/transactions?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "Tu sesión venció. Volvé a ingresar." : "No pudimos cargar las compras.");
      setData(await response.json() as ResponseData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No pudimos cargar las compras.");
    }
  }, [month, overdueOnly, page, query]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (month) {
      const [year, monthNumber] = month.split("-").map(Number);
      params.set("from", `${month}-01`);
      params.set("to", `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`);
    }
    if (overdueOnly) params.set("overdue", "true");
    params.set("page", String(page));
    fetch(`/api/mendel/transactions?${params}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Tu sesión venció. Volvé a ingresar." : "No pudimos cargar las compras.");
        return await response.json() as ResponseData;
      })
      .then((result) => { if (!cancelled) setData(result); })
      .catch((loadError: unknown) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "No pudimos cargar las compras."); });
    return () => { cancelled = true; };
  }, [month, overdueOnly, page, query]);

  async function upload(mode: "preview" | "commit") {
    if (!selectedFile) return;
    setBusy(true); setError(""); setSuccess("");
    const form = new FormData(); form.set("file", selectedFile); form.set("mode", mode);
    try {
      const response = await fetch("/api/mendel/transactions/import", { method: "POST", body: form });
      const result = await response.json() as Preview;
      if (!response.ok) {
        setPreview(result.rowCount !== undefined ? result : null);
        if (result.code === "CSV_HAS_INVALID_ROWS") setError("El archivo tiene filas para corregir. Revisá los números de fila que aparecen debajo.");
        else setError(result.code === "CSV_REQUIRED_HEADERS_MISSING" ? "El archivo no parece una exportación de transacciones de Mendel." : result.code === "FILE_TOO_LARGE" ? "El archivo supera el límite de 8 MB." : "No se pudo procesar el CSV. Revisá el archivo y volvé a probar.");
        return;
      }
      if (mode === "preview") setPreview(result);
      else {
        setSuccess(`Importación completada: ${result.insertedCount} nuevas y ${result.updatedCount} actualizadas.`);
        setPreview(null); setSelectedFile(null);
        const input = document.getElementById("mendel-csv") as HTMLInputElement | null;
        if (input) input.value = "";
        await load();
      }
    } catch {
      setError("No pudimos conectar con FNET. Intentá nuevamente.");
    } finally { setBusy(false); }
  }

  return <main className="mendel-page">
    <header className="mendel-header">
      <Link className="mendel-back" href="/"><ArrowLeft size={17} /> Volver a FNET</Link>
      <div className="mendel-title-row"><div><p className="eyebrow">Compras · fuente Mendel</p><h1>Registro de compras</h1><p className="mendel-subtitle">Importación de exportaciones y seguimiento de comprobantes.</p></div><button className="button secondary" type="button" onClick={() => void load()}><RefreshCw size={16} /> Actualizar</button></div>
    </header>

    <section className="mendel-import-card">
      <div className="mendel-section-heading"><span className="mendel-icon"><FileUp size={19} /></span><div><h2>Actualizar desde Mendel</h2><p>Subí la exportación CSV de transacciones. El mismo archivo se puede importar más de una vez.</p></div></div>
      <div className="mendel-upload-row"><input id="mendel-csv" type="file" accept=".csv,text/csv" onChange={(event) => { setSelectedFile(event.target.files?.[0] ?? null); setPreview(null); setError(""); setSuccess(""); }} /><button className="button primary" type="button" disabled={!selectedFile || busy} onClick={() => void upload("preview")}>{busy ? "Procesando…" : "Revisar archivo"}</button></div>
      {preview && <div className="mendel-preview"><strong>Vista previa</strong><span>{preview.rowCount} transacciones</span><span>{preview.insertedCount} nuevas</span><span>{preview.updatedCount} se actualizarán</span>{preview.duplicateRowsSkipped > 0 && <span>{preview.duplicateRowsSkipped} filas repetidas omitidas</span>}{preview.invalidRows > 0 && <span className="mendel-danger">{preview.invalidRows} filas con errores</span>}{preview.invalidRows === 0 && <button className="button primary" type="button" disabled={busy} onClick={() => void upload("commit")}>{busy ? "Importando…" : "Confirmar importación"}</button>}</div>}
      {preview?.errors.length ? <ul className="mendel-errors">{preview.errors.slice(0, 8).map((item) => <li key={`${item.line}-${item.fields.join(",")}`}>Fila {item.line}: revisar {item.fields.join(", ")}</li>)}</ul> : null}
      {error && <p className="mendel-message error" role="alert">{error}</p>}{success && <p className="mendel-message success" role="status">{success}</p>}
      <p className="mendel-privacy"><ShieldCheck size={15} /> Acceso solo Admin. FNET conserva los datos necesarios para compras y comprobantes; no importa correos, identificaciones personales ni datos de tarjeta.</p>
    </section>

    <section className="mendel-metrics" aria-label="Resumen de compras">
      <article><span>Compras registradas</span><strong>{data?.summary.totalTransactions ?? "—"}</strong><small>Transacciones de Mendel</small></article>
      <article><span>Importe total</span><strong>{data?.summary.amountByCurrency.length ? data.summary.amountByCurrency.map((amount) => money(amount.totalAmount, amount.currency)).join(" · ") : "—"}</strong><small>Por moneda</small></article>
      <article><span>Sin comprobante</span><strong>{data?.summary.pendingReceipt ?? "—"}</strong><small>Requieren revisión</small></article>
      <button className={`mendel-metric-action ${overdueOnly ? "selected" : ""}`} type="button" onClick={() => { setOverdueOnly((value) => !value); setPage(1); }}><span>Falta comprobante · +30 días</span><strong>{data?.summary.overdueReceipt ?? "—"}</strong><small>{overdueOnly ? "Mostrar todas" : "Ver pendientes antiguos"}</small></button>
      <article><span>Sin cruce con Intra</span><strong>{data?.summary.pendingReconciliation ?? "—"}</strong><small>Compras que esperan conciliación</small></article>
    </section>

    <section className="mendel-table-card">
      <div className="mendel-table-heading"><div><h2>Transacciones</h2><p>{data ? `${data.total} resultados` : "Cargando…"}{data?.latestImport ? ` · última carga ${date(data.latestImport.importedAt)}` : ""}</p></div><div className="mendel-controls"><label className="mendel-search"><Search size={16} /><input aria-label="Buscar compras" placeholder="Persona, comercio o categoría" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label><label className="mendel-month">Mes <input type="month" aria-label="Filtrar por mes" value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); }} /></label></div></div>
      <div className="mendel-table-wrap"><table><thead><tr><th>Fecha</th><th>Persona</th><th>Comercio</th><th>Detalle</th><th>Importe</th><th>Comprobante Mendel</th><th>Intraoperativa</th></tr></thead><tbody>{data?.items.map((item) => { const missing = missingReceipt(item); const days = missing ? ageDays(item.transactionDate) : 0; return <tr key={item.transactionId}><td>{date(item.transactionDate)}</td><td>{item.userName ?? "Sin persona"}</td><td>{item.merchant ?? "Sin comercio"}</td><td><strong>{item.transactionCategory ?? item.transactionType ?? "—"}</strong><small>{item.budget ?? ""}</small></td><td>{money(item.totalAmount, item.currency)}</td><td><span className={`mendel-badge ${missing ? "needs" : item.hasReceipt ? "good" : "needs"}`}>{missing && days > 30 ? `Falta · ${days} d` : item.hasReceipt ? "Declarado" : item.hasReceipt === false ? "Falta" : "Revisar"}</span><small>{item.receiptStatus ?? ""}</small></td><td><span className="mendel-badge pending">Pendiente</span></td></tr>; })}</tbody></table>{data?.items.length === 0 && <div className="mendel-empty">No hay transacciones. Importá un CSV de Mendel para comenzar.</div>}</div>
      {data && data.total > 50 && <div className="mendel-pagination"><button className="button secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><span>Página {page} de {Math.ceil(data.total / 50)}</span><button className="button secondary" disabled={page >= Math.ceil(data.total / 50)} onClick={() => setPage((current) => current + 1)}>Siguiente</button></div>}
    </section>
    <p className="mendel-footnote">La exportación actual no permite vincular automáticamente cada comprobante ni identificar los artículos descargados. El estado de Intraoperativa queda pendiente hasta contar con un cruce verificable; FNET no modifica el stock oficial.</p>
  </main>;
}
