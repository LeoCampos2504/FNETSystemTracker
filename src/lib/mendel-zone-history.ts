export type ZoneHistoryItem = {
  id: string;
  decision: string;
  comment: string;
  expense_revision: number;
  actor_name: string;
  created_at: string;
};

/** A failed read must never be presented as an empty approval history. */
export async function loadZoneHistory(transactionId: string, signal?: AbortSignal): Promise<ZoneHistoryItem[]> {
  const response = await fetch(`/api/mendel/zone-control?transactionId=${encodeURIComponent(transactionId)}`, { cache: "no-store", signal });
  if (!response.ok) {
    const message = response.status === 401 ? "Tu sesión venció. Volvé a ingresar."
      : response.status === 403 ? "No tenés permiso para consultar este historial."
      : response.status === 404 ? "El gasto ya no está disponible. Actualizá el control compartido."
      : "No se pudo consultar el historial. Podés reintentar sin guardar una respuesta.";
    throw new Error(message);
  }
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("history" in result) || !Array.isArray(result.history)
    || !result.history.every((item: unknown) => {
      if (!item || typeof item !== "object") return false;
      const h = item as Partial<ZoneHistoryItem>;
      return typeof h.id === "string" && typeof h.decision === "string" && typeof h.comment === "string"
        && Number.isInteger(h.expense_revision) && typeof h.actor_name === "string"
        && typeof h.created_at === "string" && Number.isFinite(Date.parse(h.created_at));
    })) throw new Error("No se pudo leer el historial recibido. Reintentá la consulta.");
  return result.history as ZoneHistoryItem[];
}
