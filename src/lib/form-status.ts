/** Sytex exports the form status in the language of the session that downloaded it; the screens always show Spanish. */
const labels: Record<string, string> = {
  open: "Abierto", "in progress": "En proceso", "to review": "Para revisar", submitted: "Enviado", rejected: "Rechazado",
  cancelled: "Cancelado", canceled: "Cancelado", approved: "Aprobado", "approved with snags": "Aprobado con pendientes",
};
export function formStatusLabel(status: string | null | undefined): string {
  const value = (status ?? "").trim();
  return labels[value.toLowerCase()] ?? value;
}
