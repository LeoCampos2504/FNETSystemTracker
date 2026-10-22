"use client";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { TrayRow } from "@/lib/mendel-bandeja";
import type { SourceRefreshResult, SourceRefreshRow } from '@/lib/mendel-source-refresh';
import { loadZoneHistory, type ZoneHistoryItem } from "@/lib/mendel-zone-history";
import styles from "./mendel-zone-tray.module.css";
export type ZoneCatalog = { rows: TrayRow[]; users: { id: string; name: string }[]; grants: { user_id: string; zone: string; enabled: boolean }[] };
export const decisionLabel = (value?: string) => ({ AUTORIZADO: "Autorizado", NO_AUTORIZADO: "No autorizado", PENDIENTE: "Pendiente de confirmar" })[value || "PENDIENTE"] || "Pendiente de confirmar";
export async function zonePost(input: unknown) {
  const response = await fetch("/api/mendel/zone-control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 401 ? "Tu sesión venció. Volvé a ingresar." : response.status === 403 ? "No tenés permiso para esta zona." : ["EXPENSE_CHANGED", "DECISION_CHANGED"].includes(result.code) ? "Otro usuario actualizó este gasto. Recargá la bandeja antes de responder." : result.code === "INPUT_TOO_LARGE" ? "El lote es demasiado grande." : `No se guardó el cambio (${result.code || response.status}).`);
  return result;
}
const payloadKeys = ["transactionId", "zone", "date", "person", "merchant", "amount", "currency", "budget", "notes", "approvalNotes", "receipt", "locality", "coordinator", "paymentStatus", "officialApproval", "zoneSource", "documentName", "receiptStatus"] as const;
export async function refreshZoneRows(rows: SourceRefreshRow[], progress: (result: SourceRefreshResult) => void) {
  const total: SourceRefreshResult = { updated: 0, unchanged: 0, issues: [] };
  let batch: SourceRefreshRow[] = [];
  async function flush() {
    if (!batch.length) return;
    const result = await zonePost({ action: 'refresh', rows: batch }) as SourceRefreshResult;
    total.updated += result.updated; total.unchanged += result.unchanged; total.issues.push(...result.issues);
    progress({ ...total, issues: [...total.issues] }); batch = [];
  }
  for (const row of rows) {
    if (new TextEncoder().encode(JSON.stringify({ action: 'refresh', rows: [row] })).length > 58000) throw new Error('Una nota supera el tamaño de actualización. No se recortó.');
    if (batch.length >= 150 || new TextEncoder().encode(JSON.stringify({ action: 'refresh', rows: [...batch, row] })).length > 60000) await flush();
    batch.push(row);
  }
  await flush(); return total;
}
export async function publishZoneRows(rows: TrayRow[], progress: (count: number) => void) {
  if (!rows.length || rows.some(r => !r.transactionId || !r.zone)) throw new Error("Cada gasto a compartir debe tener ID real de Mendel y zona asignada. Revisá los filtros y las zonas faltantes.");
  let batch: unknown[] = [], count = 0;
  async function flush() { if (!batch.length) return; await zonePost({ action: "publish", rows: batch }); count += batch.length; progress(count); batch = []; }
  for (const row of rows) {
    const payload = Object.fromEntries(payloadKeys.map(key => [key, row[key]]));
    const size = new TextEncoder().encode(JSON.stringify({ action: "publish", rows: [...batch, payload] })).length;
    if (size > 60000 || batch.length >= 150) await flush();
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 58000) throw new Error("Una nota supera el tamaño de publicación. No se recortó el contenido.");
    batch.push(payload);
  }
  await flush(); return count;
}
export function ZoneAccessEditor({ catalog, onSaved }: { catalog: ZoneCatalog; onSaved: () => Promise<void> }) {
  const [userId, setUser] = useState(""), [zone, setZone] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const zones = [...new Set(catalog.rows.map(r => r.zone))].sort();
  async function save(enabled: boolean) { setBusy(true); setMessage(""); try { await zonePost({ action: "access", userId, zone, enabled }); await onSaved(); setMessage(enabled ? "Acceso habilitado para esa zona." : "Acceso retirado para esa zona."); } catch (e) { setMessage(e instanceof Error ? e.message : "No se guardó el acceso."); } finally { setBusy(false); } }
  return <details><summary>Permisos de coordinadores por zona</summary><p>Solo estas habilitaciones permiten ver y responder gastos. No se deducen permisos de un nombre en Excel.</p><label>Cuenta real de coordinación<select aria-label="Coordinador para Mendel" value={userId} onChange={e => setUser(e.target.value)}><option value="">Elegí una cuenta</option>{catalog.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Zona<select aria-label="Zona habilitada" value={zone} onChange={e => setZone(e.target.value)}><option value="">Elegí una zona compartida</option>{zones.map(z => <option key={z}>{z}</option>)}</select></label><p>Acceso actual: {catalog.grants.some(g => g.user_id === userId && g.zone === zone && g.enabled) ? "Habilitado" : "Sin acceso"}</p><button type="button" disabled={!userId || !zone || busy} onClick={() => void save(true)}>Habilitar zona</button> <button type="button" disabled={!userId || !zone || busy} onClick={() => void save(false)}>Retirar acceso</button><p role="status">{message}</p></details>;
}
type HistoryState = { status: "loading" | "ready" | "error"; items: ZoneHistoryItem[]; error: string };
export function ZoneDecisionEditor({ row, onSaved }: { row: TrayRow; onSaved: () => Promise<void> }) {
  const [decision, setDecision] = useState(row.internalDecision || "PENDIENTE"), [comment, setComment] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [history, setHistory] = useState<HistoryState>({ status: "loading", items: [], error: "" });
  const [historyAttempt, setHistoryAttempt] = useState(0);
  useEffect(() => {
    if (!row.revision) return;
    const controller = new AbortController();
    void loadZoneHistory(row.transactionId, controller.signal).then(items => {
      if (!controller.signal.aborted) setHistory({ status: "ready", items, error: "" });
    }).catch(e => {
      if (!controller.signal.aborted) setHistory({ status: "error", items: [], error: e instanceof Error ? e.message : "No se pudo consultar el historial." });
    });
    return () => controller.abort();
  }, [row.transactionId, row.revision, historyAttempt]);
  if (!row.revision) return <section className={styles.decisionPanel}><h3>Respuesta de coordinación</h3><p>Este gasto todavía no está compartido. Admin debe publicarlo para registrar una respuesta.</p></section>;
  async function save() { setBusy(true); setMessage(""); try { await zonePost({ action: "decide", transactionId: row.transactionId, revision: row.revision, expectedDecisionId: row.decisionId ?? null, requestId: crypto.randomUUID(), decision, comment }); await onSaved(); } catch (e) { setMessage(e instanceof Error ? e.message : "No se guardó la respuesta."); } finally { setBusy(false); } }
  return <section className={styles.decisionPanel} aria-label="Respuesta de coordinación">
    <header className={styles.decisionHeading}><h3>Respuesta de coordinación</h3><span className={styles.decisionBadge} data-decision={row.internalDecision || "PENDIENTE"}>{decisionLabel(row.internalDecision)}</span></header>
    {row.decisionActor && <p className={styles.detailHint}>Última respuesta: {row.decisionActor}</p>}
    {row.needsReconfirmation && <p className={styles.reconfirmation}>El gasto cambió. Necesita una nueva confirmación.</p>}
    <form aria-label="Confirmación interna de coordinación" onSubmit={event => { event.preventDefault(); if (!busy) void save(); }}>
      <label>Respuesta<select aria-label="Confirmación interna" value={decision} disabled={busy} onChange={e => setDecision(e.target.value)}><option value="PENDIENTE">Pendiente de confirmar</option><option value="AUTORIZADO">Autorizado</option><option value="NO_AUTORIZADO">No autorizado</option></select></label>
      <label>Comentario <span className={styles.optional}>opcional</span><textarea aria-label="Comentario del coordinador" rows={2} value={comment} maxLength={1000} disabled={busy} placeholder="Aclaración o motivo de la respuesta" onChange={e => setComment(e.target.value)} /></label>
      <p className={styles.detailHint}>Se guarda tu cuenta, fecha e historial en FNET. No aprueba ni rechaza el gasto en Mendel.</p>
      {message && <p className={styles.decisionError} role="alert">{message}</p>}
      <button type="submit" className={`${styles.primary} ${styles.confirmButton}`} disabled={busy}><CheckCircle2 size={17} aria-hidden="true" />{busy ? "Guardando…" : "Confirmar respuesta"}</button>
    </form>
    <details className={styles.historyDetails}>
      <summary>Historial {history.status === "ready" && `(${history.items.length})`}{history.status === "error" && "· no disponible"}</summary>
      {history.status === "loading" && <p role="status">Consultando historial…</p>}
      {history.status === "error" && <div><p className={styles.decisionError} role="alert">{history.error}</p><button type="button" onClick={() => { setHistory({ status: "loading", items: [], error: "" }); setHistoryAttempt(attempt => attempt + 1); }}>Reintentar historial</button></div>}
      {history.status === "ready" && (history.items.length ? history.items.map(h => <article key={h.id}><strong>{decisionLabel(h.decision)}</strong><small>{h.actor_name} · {new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(h.created_at))} · versión {h.expense_revision}</small><p>{h.comment || "Sin comentario"}</p></article>) : <p>Sin respuestas registradas.</p>)}
    </details>
  </section>;
}
