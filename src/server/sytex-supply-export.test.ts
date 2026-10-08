import { describe, expect, it } from "vitest";
import { parseSytexExportSheets, parseSytexFormRows, parseSytexMaintenanceRows, parseSytexSupplyRows, parseSytexTaskDates, parseSytexTaskRows } from "./sytex-supply-export";

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
  it("reads the insumo of templates that register description and quantity in one table answer", () => {
    const result = parseSytexSupplyRows([headers,
      row("1.11.1", "¿Debe registrar insumos utilizados?", "Si", "INSUMOS/MATERIALES", "FO-26-610449"),
      row("1.11.2A.1", "TIPO DE INSUMO / MATERIAL", "Insumo: Guata filtro\nCantidad: 1", "[#1] Insumo", "FO-26-610449"),
      row("1.11.2B.1", "TIPO DE INSUMO / MATERIAL", "Insumo: Gas R410A\nCantidad: 2,5", "[#2] Insumo", "FO-26-610449"),
    ]);
    expect(result.items.map((item) => [item.formulario, item.indice, item.description, item.quantity])).toEqual([["FO-26-610449", "1.11.2A", "Guata filtro", "1"], ["FO-26-610449", "1.11.2B", "Gas R410A", "2.5"]]);
    expect(result.errors).toEqual([]);
  });
  it("lets an explicit description or quantity win over the combined table answer, in either order", () => {
    for (const order of [0, 1]) {
      const explicit = [row("1.11.2A.2", "Descripción del insumo:", "Guata"), row("1.11.2A.3", "Cantidad utilizada:", "3")];
      const combined = [row("1.11.2A.1", "TIPO DE INSUMO / MATERIAL", "Insumo: Guata filtro\nCantidad: 1")];
      const result = parseSytexSupplyRows([headers, ...(order ? [...explicit, ...combined] : [...combined, ...explicit])]);
      expect(result.errors).toEqual([]);
      expect(result.items.map((item) => [item.description, item.quantity])).toEqual([["Guata", "3"]]);
    }
  });
  it("reads a second name line such as \"Material: 1\" or \"Material: 4 litros\" as the quantity, in either order", () => {
    const answers = ["Insumo: Silicona transparente \nMaterial: 1", "Material: 2\nInsumo: Bolsa de residuos", "Insumo: Nafta\nMaterial: Para 4 litros", "Insumo: Cera\nMaterial: Cera para piso"];
    const result = parseSytexSupplyRows([headers, ...answers.map((answer, i) => row(`1.30${"ABCD"[i]}.1`, "TIPO DE INSUMO/MATERIAL", answer, `[#${i + 1}] INGRESAR CANTIDAD DE INSUMOS`, "FO-26-541431"))]);
    expect(result.errors).toEqual([]);
    expect(result.items.map((item) => [item.description, item.quantity])).toEqual([["Silicona transparente", "1"], ["Bolsa de residuos", "2"], ["Nafta", "4"], ["Cera", null]]);
  });
  it("names the form whose answers contradict each other", () => {
    const result = parseSytexSupplyRows([headers, row("9.2A.1", "Descripción del insumo:", "Diésel 500", "[#1] Insumo", "FO-26-000009"), row("9.2A.1", "Descripción del insumo:", "Nafta", "[#1] Insumo", "FO-26-000009")]);
    expect(result.errors).toEqual([{ line: 3, code: "ITEM_FIELD_CONFLICT", form: "FO-26-000009" }]);
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
    expect(result.errors).toEqual([{ line: 4, code: "ITEM_FIELD_CONFLICT", form: "FO-26-000001" }]);
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

describe("yearly maintenance reported in the forms", () => {
  const head = ["Formulario", "Grupo", "Índice", "Pregunta", "Respuesta", "Códigos de sitios afectados", "Nombres de sitios afectados", "Estado", "Última edición el", "Última edición por"];
  const line = (form: string, group: string, question: string, answer: unknown, site = "ST00001", edited = "2026-10-02T15:00:00") => [form, group, "1.1", question, answer, site, "Sitio", "Enviado", edited, "Técnico"];
  it("takes the last service date, or the form date when the service is done in it", () => {
    expect(parseSytexMaintenanceRows([head,
      line("FO-26-000001", "SERVICE ANUAL", "Indique la fecha del último service anual", new Date("2025-11-03T00:00:00Z")),
      line("FO-26-000001", "SERVICE ANUAL", "Va a realizar Service anual?", "No"),
      line("FO-26-000002", "SERVICE ANUAL", "Indique la fecha del último service anual", "2025-09-10", "ST00002"),
      line("FO-26-000002", "SERVICE ANUAL", "Va a realizar Service anual?", "Si", "ST00002"),
    ]).map((fact) => [fact.siteCode, fact.kind, fact.lastDate])).toEqual([["ST00001", "SERVICE_GE", "2025-11-03"], ["ST00002", "SERVICE_GE", "2026-10-02"]]);
  });
  it("uses the oldest filter replacement among the air conditioners of a form and ignores empty answers", () => {
    expect(parseSytexMaintenanceRows([head,
      line("FO-26-000003", "[#1] Aire Acondicionado", "Fecha de reemplazo de los filtros.", "2026-06-09"),
      line("FO-26-000003", "[#2] Aire Acondicionado", "Fecha de reemplazo de los filtros.", "2026-01-14"),
      line("FO-26-000003", "[#3] Aire Acondicionado", "Fecha de reemplazo de los filtros.", null),
      line("FO-26-000003", "General", "Fecha de visita", "2026-10-01"),
    ])).toEqual([{ siteCode: "ST00001", kind: "FILTROS_AA", lastDate: "2026-01-14", formCode: "FO-26-000003", reportedAt: "2026-10-02T15:00:00" }]);
  });
});

describe("form list links", () => {
  it("keeps the Sytex link of each form and drops unsafe ones", () => {
    const head = ["Code", "Name", "Template", "Project", "Link"];
    const forms = parseSytexExportSheets([
      [headers, row("1.1", "Descripción", "Silicona"), row("1.2", "Cantidad", 2)],
      [head, ["FO-26-000001", "MPC-AA", "Mantenimiento Preventivo Civil", "NON - MPC", "https://claro.sytex.io/d/f/abc"], ["FO-26-000002", "MPC-GE", "Mantenimiento Preventivo Civil", "NON - MPC", "javascript:alert(1)"]],
    ]).formContexts;
    expect(forms?.map((form) => form.link)).toEqual(["https://claro.sytex.io/d/f/abc", undefined]);
  });
});

describe('form list status and plan date',()=>{
  it('reads status and plan date when the list has them, in either language', () => {
    const forms = parseSytexFormRows([
      ["Code", "Name", "Template", "Project", "Status", "Plan date"],
      ["FO-26-100001", "MPC-GE", "Preventivo", "NON - MPC", "Open", "2026-10-20 09:00:00"],
      ["FO-26-100002", "Reparar", "Correctivo", "NON - MCC", "", ""],
    ]);
    expect(forms[0]).toMatchObject({ status: "Open", planDate: "2026-10-20" });
    expect(forms[1].status).toBeUndefined();
    expect(forms[1].planDate).toBeUndefined();
  });
});

const answersHeadersForTasks = ["Formulario", "Grupo", "Índice", "Pregunta", "Respuesta", "Códigos de sitios afectados", "Última edición el", "Última edición por"];
describe("corrective tasks from the task export", () => {
  const head = ["Code", "Task description", "Project", "Affected sites codes", "Affected sites names", "Task type", "Task template", "Status", "Assigned staff", "Link"];
  const rows = [
    head,
    ["TA-26-412547", "Correctivo Civil Integral", "NON - MCCIntegral Mantenimiento Correctivo Civil O&M", "ST00213", "Salta 12", "Correctivo", "Correctivo Civil Integral", "Open", "Ana, Luis", "https://claro.sytex.io/o/1/w/task-1"],
    ["TA-26-395721", "MPC-GE", "NON - MPC Mantenimiento Preventivo Civil O&M", "ST00001", "Sitio", "Preventivo", "MPC Grupo Electrógeno", "Open", "", ""],
    ["XX-26-000001", "Otro", "NON - MCC", "ST1", "S", "Correctivo", "", "Open", "", ""],
  ];
  it("keeps corrective TA tasks with zone, site, status, crew and link, and drops preventive ones", () => {
    expect(parseSytexTaskRows(rows)).toEqual([{ code: "TA-26-412547", project: "NON - MCCIntegral Mantenimiento Correctivo Civil O&M", type: "CORRECTIVO", siteCode: "ST00213", siteName: "Salta 12", description: "Correctivo Civil Integral", technicians: ["Ana", "Luis"], link: "https://claro.sytex.io/o/1/w/task-1", status: "Open" }]);
    expect(parseSytexTaskRows([head])).toEqual([]);
  });
  it("joins the task list to the forms and answers of the same synchronization", () => {
    const parsed = parseSytexExportSheets([[answersHeadersForTasks, ["FO-26-100001", "[#1] Insumo", "1.1.1", "Descripción", "Cable", "ST00213", "2026-10-02 10:00:00", "Ana"], ["FO-26-100001", "[#1] Insumo", "1.1.2", "Cantidad", 2, "ST00213", "2026-10-02 10:00:00", "Ana"]], rows]);
    expect(parsed.formContexts?.map((form) => form.code)).toEqual(["TA-26-412547"]);
  });
});

describe("sub-zone and real dates of tasks", () => {
  const taskHead = ["Code", "Task description", "Project", "Affected sites codes", "Affected sites names", "Task type", "Task template", "Status", "Sub project", "Request date", "Start plan date", "Start date", "Finish date"];
  const tasks = [taskHead,
    ["TA-26-394939", "MPC Aire Acondicionado", "NON - MPC Mantenimiento Preventivo Civil O&M", "JU00139", "Jujuy - Mariano Moreno", "Maintenance", "MPC Aire Acondicionado", "Completed", "Jujuy", "2026-09-28", "2026-10-01 ", "2026-10-06 15:34:21.113817", "2026-10-06 15:34:21.113817"],
    ["TA-26-394942", "MPC Aire Acondicionado", "NON - MPC Mantenimiento Preventivo Civil O&M", "JU00139", "Jujuy - Mariano Moreno", "Maintenance", "MPC Aire Acondicionado", "Open", "Metán", "", "2026-10-01 ", " ", " "],
    ["TA-26-409910", "Correctivo", "NON - MCCIntegral Mantenimiento Correctivo Civil O&M", "ST00213", "Salta 12", "Admin", "Correctivo", "Completed", "Orán", "2026-10-01", "2026-10-09 ", "2026-10-02 12:28:24.461960", "2026-10-02 12:28:24.461960"],
  ];
  it("reads the sub-zone and the day a task was really done, not the plan date", () => {
    const dates = parseSytexTaskDates(tasks);
    expect(dates.get("TA-26-394939")).toEqual({ subZone: "Jujuy", requestedOn: "2026-09-28", startedOn: "2026-10-06", finishedOn: "2026-10-06" });
    expect(dates.get("TA-26-394942")).toEqual({ subZone: "Metán" });
    expect(parseSytexTaskRows(tasks)[0]).toMatchObject({ code: "TA-26-409910", planDate: "2026-10-09", subZone: "Orán", finishedOn: "2026-10-02", requestedOn: "2026-10-01" });
  });
  it("gives each form the sub-zone and dates of its task", () => {
    const formHead = ["Code", "Name", "Template", "Project", "Task"];
    const parsed = parseSytexExportSheets([
      [answersHeadersForTasks, ["FO-26-611211", "[#1] Insumo", "1.1.1", "Descripción", "Cable", "JU00139", "2026-10-02 10:00:00", "Ana"], ["FO-26-611211", "[#1] Insumo", "1.1.2", "Cantidad", 2, "JU00139", "2026-10-02 10:00:00", "Ana"]],
      [formHead, ["FO-26-611211", "MPC-AA", "Mantenimiento Preventivo Civil", "NON - MPC Mantenimiento Preventivo Civil O&M", "TA-26-394939"], ["FO-26-611212", "MPC-AA", "Mantenimiento Preventivo Civil", "NON - MPC Mantenimiento Preventivo Civil O&M", "TA-26-394942"]],
      tasks,
    ]);
    const form = (code: string) => parsed.formContexts?.find((context) => context.code === code);
    expect(form("FO-26-611211")).toMatchObject({ subZone: "Jujuy", finishedOn: "2026-10-06", requestedOn: "2026-09-28" });
    expect(form("FO-26-611212")).toMatchObject({ subZone: "Metán" });
    expect(form("FO-26-611212")?.finishedOn).toBeUndefined();
  });
});
