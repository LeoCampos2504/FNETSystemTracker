import { describe, expect, it } from "vitest";
import { parseSytexExportSheets, parseSytexSupplyRows } from "./sytex-supply-export";

const headers = ["Formulario", "Grupo", "Índice", "Pregunta", "Respuesta", "Códigos de sitios afectados", "Última edición el", "Última edición por"];
const date = new Date("2026-10-02T18:00:00Z");
function row(index: string, question: string, answer: string | number | null, group = "[#1] Insumo", form = "FO-26-000001") {
  return [form, group, index, question, answer, "ST00001", date, "Editor"];
}
describe("Sytex answer export material extraction", () => {
  it("pairs description, quantity and photo of the same item and keeps two items in a form separate", () => {
    const result = parseSytexSupplyRows([headers,
      row("9.2A.1", "Descripción del insumo:", "Diésel 500"),
      row("9.2A.2", "Cantidad utilizada:", "110"),
      row("9.2B.1", "Descripción del insumo:", "Diésel 500", "[#2] Insumo"),
      row("9.2B.2", "Cantidad utilizada:", "65", "[#2] Insumo"),
      row("1.24A.1", "Descripción del Insumo", "Silicona", "[#1] Insumo", "FO-26-000002"),
      row("1.24A.2", "Cantidad", "1", "[#1] Insumo", "FO-26-000002"),
      row("1.24A.3", "Foto del insumo", "OK", "[#1] Insumo", "FO-26-000002"),
    ]);
    expect(result.answerCount).toBe(7);
    expect(result.formCount).toBe(2);
    expect(result.items.map((item) => item.quantity)).toEqual(["110", "65", "1"]);
    expect(result.items[2]).toMatchObject({ image: null, imageDeclared: true, lastEditedBy: "Editor", sourceEditedAt: "2026-10-02T18:00:00.000" });
    expect(result.items[2].sourceAnswers.map((answer) => answer.index)).toEqual(["1.24A.1", "1.24A.2", "1.24A.3"]);
    expect(result.warnings).toEqual([{ line: 8, code: "IMAGE_FILE_MISSING" }]);
    expect(result.errors).toEqual([]);
  });
  it("does not count empty material questions, yes/no answers or generic photos as material rows", () => {
    const result = parseSytexSupplyRows([headers,
      row("9.2A.1", "Descripción del insumo:", null),
      row("9.2A.2", "Cantidad utilizada:", null),
      row("1.23", "¿Se utilizo insumos durante el mantenimiento realizado?", "Si", "ENTORNO & ENERGÍA"),
      row("1.49.1", "Registre los insumos utilizados", "OK", "INSUMOS"),
      row("1.4", "Foto del sitio", "OK", "General"),
    ]);
    expect(result.answerCount).toBe(5);
    expect(result.items).toEqual([]);
  });
  it("accepts numeric zero and comma decimals while leaving quantities with units pending", () => {
    const result = parseSytexSupplyRows([headers,
      row("1.1", "Descripción del insumo:", "Material"), row("1.2", "Cantidad", 0),
      row("2.1", "Descripción del insumo:", "Otro"), row("2.2", "Cantidad", "1,5"),
      row("3.1", "Descripción del insumo:", "Pendiente"), row("3.2", "Cantidad", "2 rollos"),
    ]);
    expect(result.items.map((item) => item.quantity)).toEqual(["0", "1.5", null]);
    expect(result.warnings.map((issue) => issue.code)).toContain("QUANTITY_NOT_NUMERIC");
  });
  it("rejects conflicting values rather than overwriting an item", () => {
    const result = parseSytexSupplyRows([headers,
      row("1.1", "Descripción del insumo:", "LED"), row("1.2", "Cantidad", "1"), row("1.2", "Cantidad", "2"),
    ]);
    expect(result.errors).toEqual([{ line: 4, code: "ITEM_FIELD_CONFLICT" }]);
    expect(result.items[0].quantity).toBe("1");
  });
  it("does not duplicate identical answers", () => {
    const result = parseSytexSupplyRows([headers, row("1.1", "Descripción del insumo:", "LED"), row("1.1", "Descripción del insumo:", "LED")]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].sourceAnswers).toHaveLength(1);
  });
  it("rejects a populated material answer without a reliable item identity", () => {
    const result = parseSytexSupplyRows([headers, row("", "Descripción del insumo:", "LED")]);
    expect(result.errors[0].code).toBe("ITEM_IDENTITY_INVALID");
  });
  it("accepts an actual image link but rejects script URLs", () => {
    const result = parseSytexSupplyRows([headers,
      row("1.1", "Descripción del insumo:", "LED"), row("1.3", "Foto del insumo", "https://example.invalid/image.jpg"),
      row("2.1", "Descripción del insumo:", "Otro"), row("2.3", "Foto del insumo", "javascript:alert(1)"),
    ]);
    expect(result.items[0].image).toBe("https://example.invalid/image.jpg");
    expect(result.items[1].image).toBeNull();
  });
  it("rejects missing or ambiguous required headers", () => {
    expect(() => parseSytexSupplyRows([["Formulario"], ["FO-26-000001"]])).toThrow("SYTEX_EXPORT_HEADERS_MISSING");
    expect(() => parseSytexSupplyRows([[...headers, "Respuesta"], row("1.1", "Descripción del insumo:", "LED")])).toThrow("SYTEX_EXPORT_HEADERS_AMBIGUOUS");
  });
});

describe("Sytex exports of several projects", () => {
  const answersEn = ["Form", "Network element", "Affected sites codes", "Status", "Group", "Index", "Question", "Answer", "Last edition on", "Last edition by"];
  const formsEn = ["Code", "Name", "Template", "Project", "Affected sites codes", "Affected sites names", "Assigned to", "Collaborator user"];
  it("reads the English column names and joins every project in one import", () => {
    const result = parseSytexExportSheets([
      [headers, row("1.1", "Descripción", "Silicona"), row("1.2", "Cantidad", 2)],
      [answersEn, ["FO-26-000009", null, "BA00001", "Open", "[#1] INSUMOS UTILIZADOS", "4.1A.1", "Descripción", "Precintos", date, "Editor"],
        ["FO-26-000009", null, "BA00001", "Open", "[#1] INSUMOS UTILIZADOS", "4.1A.2", "Cantidad", 10, date, "Editor"]],
      [formsEn, ["FO-26-000001", "MPC-AA", "Mantenimiento Preventivo Civil", "NON - MPC Mantenimiento Preventivo Civil O&M", "ST00001", "Sitio", "a@example.invalid", null]],
      [formsEn, ["FO-26-000009", "Correctivo", "Mantenimiento Correctivo Civil O&M", "BAS - MCCIntegral Mantenimiento Correctivo Civil O&M", "BA00001", "Otro", null, null]],
    ]);
    expect(result.items.map((item) => [item.formulario, item.description, item.quantity, item.siteCode])).toEqual([
      ["FO-26-000001", "Silicona", "2", "ST00001"], ["FO-26-000009", "Precintos", "10", "BA00001"],
    ]);
    expect(result.formContexts?.map((form) => [form.code, form.type, form.project])).toEqual([
      ["FO-26-000001", "PREVENTIVO", "NON - MPC Mantenimiento Preventivo Civil O&M"],
      ["FO-26-000009", "CORRECTIVO", "BAS - MCCIntegral Mantenimiento Correctivo Civil O&M"],
    ]);
    expect(result.errors).toEqual([]);
  });
  it("needs at least one answers file and refuses files that are not Sytex exports", () => {
    expect(() => parseSytexExportSheets([[formsEn, ["FO-26-000001", "A", "B", "NON - MPC", "", "", "", ""]]])).toThrow("SYTEX_EXPORT_ANSWERS_REQUIRED");
    expect(() => parseSytexExportSheets([[["Otra", "Planilla"], ["a", "b"]]])).toThrow("SYTEX_EXPORT_FILE_UNKNOWN");
  });
  it("refuses the same form listed under two different projects", () => {
    expect(() => parseSytexExportSheets([
      [headers, row("1.1", "Descripción", "Silicona"), row("1.2", "Cantidad", 2)],
      [formsEn, ["FO-26-000001", "A", "Preventivo", "NON - MPC", "", "", "", ""]],
      [formsEn, ["FO-26-000001", "A", "Preventivo", "BAS - MPC", "", "", "", ""]],
    ])).toThrow("SYTEX_EXPORT_FORM_CONFLICT");
  });
});
