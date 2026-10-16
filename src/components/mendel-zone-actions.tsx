"use client";
import { useEffect, useState } from "react";
import type { TrayRow } from "@/lib/mendel-bandeja";
export type ZoneCatalog = { rows: TrayRow[]; users: { id: string; name: string }[]; grants: { user_id: string; zone: string; enabled: boolean }[] };
export const decisionLabel = (value?: string) => ({ AUTORIZADO: "Autorizado", NO_AUTORIZADO: "No autorizado", PENDIENTE: "Pendiente de confirmar" })[value || "PENDIENTE"] || "Pendiente de confirmar";
export async function zonePost(input: unknown) {
  const response = await fetch("/api/mendel/zone-control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 401 ? "Tu sesión venció. Volvé a ingresar." : response.status === 403 ? "No tenés permiso para esta zona." : ["EXPENSE_CHANGED", "DECISION_CHANGED"].includes(result.code) ? "Otro usuario actualizó este gasto. Recargá la bandeja antes de responder." : result.code === "INPUT_TOO_LARGE" ? "El lote es demasiado grande." : `No se guardó el cambio (${result.code || response.status}).`);
  return result;
}
const payloadKeys = ["transactionId", "zone", "date", "person", "merchant", "amount", "currency", "budget", "notes", "approvalNotes", "receipt", "locality", "coordinator", "paymentStatus", "officialApproval", "zoneSource"] as const;
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
type HistoryItem = { id: string; decision: string; comment: string; expense_revision: number; actor_name: string; created_at: string };
export function ZoneDecisionEditor({ row, onSaved }: { row: TrayRow; onSaved: () => Promise<void> }) {
  const [decision, setDecision] = useState(row.internalDecision || "PENDIENTE"), [comment, setComment] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [history, setHistory] = useState<HistoryItem[]>([]);
  useEffect(() => { if (!row.revision) return; let live = true; void fetch(`/api/mendel/zone-control?transactionId=${encodeURIComponent(row.transactionId)}`, { cache: "no-store" }).then(async r => { if (!r.ok) throw new Error("No se pudo consultar el historial."); return r.json(); }).then(r => { if (live) setHistory(r.history); }).catch(e => { if (live) setMessage(e.message); }); return () => { live = false; }; }, [row.transactionId, row.revision]);
  if (!row.revision) return <p>Este gasto todavía no está compartido. Admin debe publicarlo para registrar la respuesta del coordinador.</p>;
  async function save() { setBusy(true); setMessage(""); try { await zonePost({ action: "decide", transactionId: row.transactionId, revision: row.revision, expectedDecisionId: row.decisionId ?? null, requestId: crypto.randomUUID(), decision, comment }); await onSaved(); } catch (e) { setMessage(e instanceof Error ? e.message : "No se guardó la respuesta."); } finally { setBusy(false); } }
  return <section><h3>Confirmación interna de coordinación</h3><p>No aprueba ni rechaza el gasto en Mendel. {row.needsReconfirmation && "El gasto cambió: necesita nueva confirmación."}</p><label>Respuesta<select aria-label="Confirmación interna" value={decision} onChange={e => setDecision(e.target.value)}><option value="PENDIENTE">Pendiente de confirmar</option><option value="AUTORIZADO">Autorizado</option><option value="NO_AUTORIZADO">No autorizado</option></select></label><label>Comentario<textarea aria-label="Comentario del coordinador" value={comment} maxLength={1000} onChange={e => setComment(e.target.value)} /></label><button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar confirmación"}</button><p role="status">{message}</p><h3>Historial</h3>{history.length ? history.map(h => <article key={h.id}><strong>{decisionLabel(h.decision)}</strong> · {h.actor_name} · {new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(h.created_at))} · versión {h.expense_revision}<p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{h.comment || "Sin comentario"}</p></article>) : <p>Sin respuestas registradas.</p>}</section>;
}
