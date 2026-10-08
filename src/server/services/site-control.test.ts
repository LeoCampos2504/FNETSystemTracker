import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/prisma", () => ({ getPrismaClient: () => ({}) }));
import { parseSytexSiteAnswers, siteTopic } from "@/server/sytex-supply-export";
import { answerNumber, fuelLoadsFromAnswers, serviceReportsFromAnswers, type StoredAnswer } from "./site-control";

const header = ["Formulario", "Grupo", "Índice", "Pregunta", "Respuesta", "Códigos de sitios afectados", "Nombres de sitios afectados", "Estado", "Última edición el", "Última edición por"];
const row = (group: string, index: string, question: string, answer: string, form = "FO-26-000001") => [form, group, index, question, answer, "ST00079", "Rosario de la Frontera 2", "Approved", "2026-10-03 10:00:00", "Técnico"];
const stored = (rows: unknown[][]): StoredAnswer[] => parseSytexSiteAnswers([header, ...rows]).map((a) => ({ ...a, groupName: a.group, position: a.index }));

describe("site control answers from Sytex", () => {
  it("sorts answers into generator service, fluids, fuel and air conditioner filters", () => {
    expect(siteTopic("Service anual", "¿Va a realizar service anual?")).toBe("SERVICE_GE");
    expect(siteTopic("Service anual", "Cambio de filtro de aceite")).toBe("SERVICE_GE");
    expect(siteTopic("Service anual", "Litros de aceite agregados")).toBe("FLUIDOS");
    expect(siteTopic("Grupo electrógeno", "Agua destilada (litros)")).toBe("FLUIDOS");
    expect(siteTopic("[#1] Carga de combustible", "Litros cargados")).toBe("COMBUSTIBLE");
    expect(siteTopic("Aire acondicionado 1", "Fecha de reemplazo de los filtros")).toBe("FILTROS_AA");
    expect(siteTopic("[#1] Insumo", "Descripción del insumo:")).toBeNull();
    expect(siteTopic("Entorno", "Sellado de entry ports requiere atención?")).toBeNull();
  });
  it("reads numbers the way technicians write them", () => {
    expect(answerNumber("40")).toBe(40);
    expect(answerNumber("12,5 litros")).toBe(12.5);
    expect(answerNumber("1.709,4")).toBe(1709.4);
    expect(answerNumber("No informado")).toBeNull();
  });
  it("builds one fuel load per repeated group, with levels and hour meter", () => {
    const loads = fuelLoadsFromAnswers(stored([
      row("[#1] Carga de combustible", "2.1", "Tipo de combustible", "Diesel 500"),
      row("[#1] Carga de combustible", "2.2", "Nivel de combustible inicial (%)", "24"),
      row("[#1] Carga de combustible", "2.3", "Litros de combustible cargados", "400,09"),
      row("[#1] Carga de combustible", "2.4", "Nivel de combustible final (%)", "64"),
      row("Grupo electrógeno", "3.1", "Horómetro", "45,5"),
      row("[#2] Carga de combustible", "2.3", "Litros de combustible cargados", "0"),
    ]));
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ formCode: "FO-26-000001", siteCode: "ST00079", liters: 400.09, fuel: "Diesel 500", levelBefore: "24", levelAfter: "64", hourmeter: "45,5" });
  });
  it("sums the oil, distilled water and coolant of a service and lists the filters changed", () => {
    const [report] = serviceReportsFromAnswers(stored([
      row("Service anual", "4.1", "¿Va a realizar service anual?", "Si"),
      row("Service anual", "4.2", "Litros de aceite agregados", "8 L"),
      row("Service anual", "4.3", "Agua destilada (litros)", "2"),
      row("Service anual", "4.4", "Líquido refrigerante cargado", "5 litros"),
      row("Service anual", "4.5", "Cambio de filtro de aceite", "Si"),
      row("Service anual", "4.6", "Cambio de filtro de aire", "No"),
    ]));
    expect(report).toMatchObject({ serviceDone: true, oilLiters: 8, waterLiters: 2, coolantLiters: 5, filters: ["Cambio de filtro de aceite"] });
    expect(report.answers).toHaveLength(6);
  });
});
