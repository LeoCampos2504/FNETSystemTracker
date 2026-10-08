import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/prisma", () => ({ getPrismaClient: () => ({}) }));
import { parseSytexSiteAnswers, siteTopic } from "@/server/sytex-supply-export";
import { answerNumber, fuelLoadsFromAnswers, serviceReportsFromAnswers, type StoredAnswer } from "./site-control";

const header = ["Formulario", "Grupo", "Índice", "Pregunta", "Respuesta", "Códigos de sitios afectados", "Nombres de sitios afectados", "Estado", "Última edición el", "Última edición por"];
const row = (group: string, index: string, question: string, answer: string, form = "FO-26-000001") => [form, group, index, question, answer, "ST00079", "Rosario de la Frontera 2", "Approved", "2026-10-03 10:00:00", "Técnico"];
const stored = (rows: unknown[][]): StoredAnswer[] => parseSytexSiteAnswers([header, ...rows]).map((a) => ({ ...a, groupName: a.group, position: a.index }));

describe("site control answers from Sytex", () => {
  it("sorts the answers of the generator and air conditioner preventives", () => {
    expect(siteTopic("SERVICE ANUAL", "Va a realizar Service anual?")).toBe("SERVICE_GE");
    expect(siteTopic("SERVICE ANUAL", "Cambio de Filtro de Combustible")).toBe("SERVICE_GE");
    expect(siteTopic("GENERADOR", "NIVEL DE COMBUSTIBLE [%]")).toBe("COMBUSTIBLE");
    expect(siteTopic("General", "CANTIDAD DE LITROS DE COMBUSTIBLE CARGADOS")).toBe("COMBUSTIBLE");
    expect(siteTopic("GENERADOR", "HOROMETRO [Hs]")).toBe("HOROMETRO");
    expect(siteTopic("GENERADOR", "NIVEL DE ACEITE Y ESTADO")).toBe("FLUIDOS");
    expect(siteTopic("EVAPORADOR", "Fecha de reemplazo de los filtros.")).toBe("FILTROS_AA");
    expect(siteTopic("EVAPORADOR", "¿El filtro de aire fue:?")).toBe("FILTROS_AA");
    expect(siteTopic("COMPRESOR", "Indicar tipo de Gas Refrigerante utilizado")).toBeNull();
    expect(siteTopic("[#1] Ingrese cantidad de insumos", "Tipo de insumo")).toBeNull();
  });
  it("reads numbers the way technicians write them", () => {
    expect(answerNumber("40")).toBe(40);
    expect(answerNumber("12,5 litros")).toBe(12.5);
    expect(answerNumber("1.709,4")).toBe(1709.4);
    expect(answerNumber("No informado")).toBeNull();
  });
  it("builds the fuel load of a generator preventive with the level before and after", () => {
    const loads = fuelLoadsFromAnswers(stored([
      row("GENERADOR", "1.2.5", "HOROMETRO [Hs]", "45,5"),
      row("GENERADOR", "1.2.6", "NIVEL DE COMBUSTIBLE [%]", "24"),
      row("General", "1.46", "CANTIDAD DE LITROS DE COMBUSTIBLE CARGADOS", "400,09"),
      row("General", "1.47", "PORCENTAJE  DE COMBUSTIBLE POSTERIOR A LA CARGA", "64"),
      row("GENERADOR", "1.2.6", "NIVEL DE COMBUSTIBLE [%]", "50", "FO-26-000002"),
      row("General", "1.46", "CANTIDAD DE LITROS DE COMBUSTIBLE CARGADOS", "0", "FO-26-000002"),
    ]));
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ formCode: "FO-26-000001", siteCode: "ST00079", liters: 400.09, levelBefore: "24", levelAfter: "64", hourmeter: "45,5" });
  });
  it("reports what the yearly service changed and takes the liters from the insumos of the form", () => {
    const [report] = serviceReportsFromAnswers(stored([
      row("SERVICE ANUAL", "1.5.3", "Va a realizar Service anual?", "Si"),
      row("SERVICE ANUAL", "1.5.4", "Cambio de aceite", "Si"),
      row("SERVICE ANUAL", "1.5.5", "Cambio de Filtro de Aceite", "Si"),
      row("SERVICE ANUAL", "1.5.6", "Cambio de Filtro de Combustible", "Si"),
      row("SERVICE ANUAL", "1.5.7", "Cambio de Filtro de Aire", "No"),
      row("SERVICE ANUAL", "1.5.9", "Cambio de líquido refrigerante", "Si"),
      row("SERVICE ANUAL", "1.5.14", "FILTRO AIRE - Requiere atención?", "Si"),
    ]), [
      { formCode: "FO-26-000001", description: "Aceite 15W40", quantity: "8" },
      { formCode: "FO-26-000001", description: "Agua destilada", quantity: "2" },
      { formCode: "FO-26-000001", description: "Líquido refrigerante", quantity: "5" },
      { formCode: "FO-26-000001", description: "Filtro de aceite", quantity: "1" },
      { formCode: "FO-26-000009", description: "Aceite 15W40", quantity: "4" },
    ]);
    expect(report).toMatchObject({ serviceDone: true, oilChanged: true, coolantChanged: true, oilLiters: 8, waterLiters: 2, coolantLiters: 5, filters: ["Filtro de Aceite", "Filtro de Combustible"] });
    expect(report.supplies).toEqual(["Aceite 15W40: 8", "Agua destilada: 2", "Líquido refrigerante: 5"]);
  });
});
