import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TrayRow } from "@/lib/mendel-bandeja";
import { MendelExpenseDetail } from "./mendel-expense-detail";

const row: TrayRow = {
  key: "EXAMPLE-1", transactionId: "EXAMPLE-1", date: "2026-10-16", person: "Persona ficticia",
  merchant: "Comercio sintético", amount: "25000", currency: "ARS", budget: "VIATICOS",
  notes: "Nota sintética", approvalNotes: "", receipt: "NO", zone: "NOA", locality: "",
  coordinator: "", paymentStatus: "Confirmada", officialApproval: "", zoneSource: "Planilla de prueba",
  revision: 1, internalDecision: "PENDIENTE",
};
const render = (changes: Partial<TrayRow> = {}) => renderToStaticMarkup(createElement(MendelExpenseDetail, { row: { ...row, ...changes }, onSaved: async () => {} }));

describe("compact expense detail presentation", () => {
  it("uses the primary confirmation action instead of assigning every expense", () => {
    const html = render();
    expect(html).toContain("Confirmar respuesta");
    expect(html).toMatch(/type="submit" class="[^"]*primary[^\"]*"/);
    expect(html).not.toContain("Asignar a todos sus consumos");
    expect(html).not.toContain("Zona para todos sus consumos");
  });
  it("does not default a pending expense to authorized", () => {
    expect(render()).toContain('<option value="PENDIENTE" selected="">Pendiente de confirmar</option>');
    expect(render({ internalDecision: "NO_AUTORIZADO" })).toContain('<option value="NO_AUTORIZADO" selected="">No autorizado</option>');
  });
  it("preserves full notes as escaped text, including the end of a long note", () => {
    const html = render({ notes: "Detalle ".repeat(1000) + "FIN <script>example</script>" });
    expect(html).toContain("FIN &lt;script&gt;example&lt;/script&gt;");
    expect(html).not.toContain("<script>example</script>");
  });
  it("keeps transaction notes and source approval notes separate", () => {
    const html = render({ notes: "Nota de compra ficticia", approvalNotes: "Nota de aprobación ficticia" });
    expect(html).toContain("Nota de compra ficticia");
    expect(html).toContain("Nota de aprobación de la fuente");
    expect(html).toContain("Nota de aprobación ficticia");
  });
  it("keeps official approval distinct from the coordinator response and payment", () => {
    const html = render({ internalDecision: "AUTORIZADO" });
    expect(html).toContain("No aprueba ni rechaza el gasto en Mendel.");
    expect(html).toContain("No disponible en esta fuente");
    expect(html).toContain("Estado del pago (no aprobación)");
    expect(html).toContain("Confirmada");
  });
  it("does not offer confirmation before sharing the expense", () => {
    const html = render({ revision: undefined });
    expect(html).not.toContain("Confirmar respuesta");
    expect(html).toContain("todavía no está compartido");
  });
  it("shows a loading history rather than an unverified empty history", () => {
    const html = render();
    expect(html).toContain("Consultando historial…");
    expect(html).not.toContain("Sin respuestas registradas.");
  });
  it("keeps source information and history collapsed until requested", () => {
    const html = render();
    expect(html).toContain("Información de origen");
    expect(html).toContain("Historial");
    expect(html).not.toMatch(/<details[^>]*\sopen(?:[\s=>])/);
  });
});
