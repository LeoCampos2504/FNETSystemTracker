import { readSheet } from "read-excel-file/node";
import { exactFormReference } from "./form-references";

type Issue = { line: number; code: string; form?: string };
type SourceAnswer = { line: number; index: string; question: string; answer: string | null; editedAt: string | null; editor: string | null };
export type SytexFormContext = { code: string; type: string; project: string; siteCode: string; siteName: string; description: string; technicians: string[]; link?: string; status?: string; planDate?: string };
export type SytexExportItem = {
  formulario: string; grupo: string; indice: string;
  description: string | null; quantity: string | null; provider: string | null;
  siteCode: string | null; siteName: string | null; status: string | null;
  image: string | null; imageDeclared: boolean;
  lastEditedBy: string | null; sourceEditedAt: string | null;
  sourceAnswers: SourceAnswer[];
};
export type SytexSupplyExport = {
  answerCount: number; formCount: number; items: SytexExportItem[];
  errors: Issue[]; warnings: Issue[]; sourceEditedFrom: string | null; sourceEditedThrough: string | null;
  formContexts?: SytexFormContext[];
  maintenance?: SytexMaintenanceFact[];
};
/** Last date a yearly job was done at a site, as the technicians report it in the preventive forms. */
export type SytexMaintenanceKind = "SERVICE_GE" | "FILTROS_AA";
export type SytexMaintenanceFact = { siteCode: string; kind: SytexMaintenanceKind; lastDate: string; formCode: string; reportedAt: string };
const MAX_ROWS = 300_000;
// Sytex exports use the language of the session that downloaded them; both spellings are the same export.
const HEADER_ALIASES: Record<string, string> = {
  form: "formulario", group: "grupo", index: "indice", question: "pregunta", answer: "respuesta",
  "affected sites codes": "codigos de sitios afectados", "affected sites names": "nombres de sitios afectados",
  status: "estado", "last edition on": "ultima edicion el", "last edition by": "ultima edicion por",
  code: "codigo", name: "nombre", template: "plantilla", project: "proyecto",
  "plan date": "fecha de plan", "planned date": "fecha de plan", "fecha plan": "fecha de plan", "task description": "descripcion de la tarea", "task type": "tipo de tarea", "task template": "plantilla de la tarea", "assigned staff": "personal asignado", "start plan date": "fecha de inicio plan", "assigned to": "asignado a", "collaborator user": "usuario colaborador", link: "enlace",
};
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " "); }
function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!(value instanceof Date) && !["string", "number", "boolean"].includes(typeof value)) return null;
  const result = value instanceof Date ? value.toISOString().replace(/Z$/, "") : String(value).trim();
  return result || null;
}
function headerKeys(row: unknown[]): string[] {
  return row.map((value) => { const key = normalize(text(value) ?? ""); return HEADER_ALIASES[key] ?? key; });
}
function quantity(value: string | null): string | null {
  if (!value) return null;
  let number = value.trim();
  if (number.includes(",") && number.includes(".")) {
    number = number.lastIndexOf(",") > number.lastIndexOf(".") ? number.replace(/\./g, "").replace(",", ".") : number.replace(/,/g, "");
  } else number = number.replace(",", ".");
  if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(number)) return null;
  return number;
}
function imageUrl(value: string | null): string | null {
  if (!value || value.length > 8192) return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? value : null; }
  catch { return null; }
}
type ItemField = "description" | "quantity" | "provider" | "image";
/** The table question some templates use to register an insumo and its quantity together. */
function isCombinedQuestion(question: string): boolean { return /^tipo de (?:insumo|material)/.test(normalize(question).replace(/[:?¿]+/g, "")); }
/** "Insumo: Guata filtro\nCantidad: 1" → description and quantity. */
function combinedFields(answer: string): [ItemField, string][] {
  const result: [ItemField, string][] = [];
  for (const line of answer.split(/\r?\n/)) {
    const cut = line.indexOf(":");
    if (cut < 0) continue;
    const label = normalize(line.slice(0, cut)).replace(/[?¿]+/g, ""), value = line.slice(cut + 1).trim();
    if (!value) continue;
    if (/^(?:insumo|material|descripcion(?: del| de)?(?: insumo| material)?)$/.test(label)) result.push(["description", value]);
    else if (/^cantidad(?: utilizada)?$/.test(label)) result.push(["quantity", value]);
    else if (/^(?:insumo provisto por|provisto por|proveedor)$/.test(label)) result.push(["provider", value]);
  }
  return result;
}
function role(question: string): ItemField | null {
  const label = normalize(question).replace(/[:?¿]+/g, "");
  if (label === "descripcion" || /^descripcion(?: del| de)?(?: insumo| material)/.test(label)) return "description";
  if (/^cantidad(?: utilizada)?$/.test(label)) return "quantity";
  if (/^(?:insumo provisto por|provisto por|proveedor)$/.test(label)) return "provider";
  if (/^(?:foto|imagen)(?: del| de)?(?: insumo| material)/.test(label)) return "image";
  return null;
}

export function parseSytexSupplyRows(rows: unknown[][]): SytexSupplyExport {
  if (rows.length < 2) throw new Error("SYTEX_EXPORT_EMPTY");
  if (rows.length > MAX_ROWS + 1) throw new Error("SYTEX_EXPORT_TOO_MANY_ROWS");
  const headers = headerKeys(rows[0]);
  const required = ["Formulario", "Grupo", "Índice", "Pregunta", "Respuesta"];
  if (required.some((key) => !headers.includes(normalize(key)))) throw new Error("SYTEX_EXPORT_HEADERS_MISSING");
  if (required.some((key) => headers.filter((header) => header === normalize(key)).length !== 1)) throw new Error("SYTEX_EXPORT_HEADERS_AMBIGUOUS");
  const get = (row: unknown[], key: string) => text(row[headers.indexOf(normalize(key))]);
  const buckets = new Map<string, SytexExportItem>();
  const seen = new Map<string, string>();
  // Values that came from a combined table answer: an explicit question about the same item wins over them.
  const combinedKeys = new Set<string>();
  const errors: Issue[] = [], warnings: Issue[] = [];
  const forms = new Set<string>(), dates: string[] = [];
  let answerCount = 0;
  rows.slice(1).forEach((row, offset) => {
    if (!row.some((cell) => cell !== null && cell !== "")) return;
    answerCount++;
    const line = offset + 2, form = exactFormReference(get(row, "Formulario"));
    if (form) forms.add(form);
    const editedAt = get(row, "Última edición el")?.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T") ?? null;
    if (editedAt && /^\d{4}-\d{2}-\d{2}T/.test(editedAt)) dates.push(editedAt);
    const group = get(row, "Grupo"), index = get(row, "Índice"), question = get(row, "Pregunta") ?? "";
    const answer = get(row, "Respuesta");
    // Some templates ask for the insumo in one table question: "Insumo: Guata filtro" and "Cantidad: 1" in the same answer.
    const single = role(question), combined = !single && !!answer && isCombinedQuestion(question), fields: [ItemField, string][] = single ? (answer ? [[single, answer]] : []) : combined ? combinedFields(answer as string) : [];
    if (!group || !/(?:insumo|material)/.test(normalize(group)) || !fields.length) return;
    const stem = index?.match(/^(.+)\.\d+$/)?.[1];
    if (!form || !index || !stem) { errors.push({ line, code: "ITEM_IDENTITY_INVALID", ...(form ? { form } : {}) }); return; }
    const key = JSON.stringify([form, group, stem]);
    const item = buckets.get(key) ?? {
      formulario: form, grupo: group, indice: stem, description: null, quantity: null, provider: null,
      siteCode: get(row, "Códigos de sitios afectados"), siteName: get(row, "Nombres de sitios afectados"), status: get(row, "Estado"),
      image: null, imageDeclared: false, lastEditedBy: null, sourceEditedAt: null, sourceAnswers: [],
    };
    let used = false;
    for (const [field, value] of fields) {
      const fieldKey = JSON.stringify([form, group, stem, field]);
      const previous = seen.get(fieldKey);
      if (previous !== undefined) {
        const fromCombined = combinedKeys.has(fieldKey);
        if (combined && !fromCombined) continue;
        if (!combined && fromCombined) combinedKeys.delete(fieldKey);
        else {
          if (previous !== value) errors.push({ line, code: "ITEM_FIELD_CONFLICT", form });
          else warnings.push({ line, code: "DUPLICATE_ANSWER_SKIPPED" });
          continue;
        }
      }
      seen.set(fieldKey, value);
      if (combined) combinedKeys.add(fieldKey);
      used = true;
      if (field === "quantity") {
        item.quantity = quantity(value);
        if (item.quantity === null) warnings.push({ line, code: "QUANTITY_NOT_NUMERIC" });
      } else if (field === "image") {
        item.image = imageUrl(value);
        item.imageDeclared = Boolean(item.image) || ["ok", "si", "true"].includes(normalize(value));
        if (item.imageDeclared && !item.image) warnings.push({ line, code: "IMAGE_FILE_MISSING" });
      } else item[field] = value;
    }
    if (!used) return;
    const editor = get(row, "Última edición por");
    item.sourceAnswers.push({ line, index, question, answer, editedAt, editor });
    if (editedAt && (!item.sourceEditedAt || editedAt >= item.sourceEditedAt)) { item.sourceEditedAt = editedAt; item.lastEditedBy = editor; }
    buckets.set(key, item);
  });
  const items = [...buckets.values()].filter((item) => item.description !== null || item.quantity !== null);
  for (const item of items) {
    if (!item.description || item.quantity === null) warnings.push({ line: item.sourceAnswers[0].line, code: "ITEM_INCOMPLETE" });
  }
  dates.sort();
  return { answerCount, formCount: forms.size, items, errors, warnings, sourceEditedFrom: dates[0] ?? null, sourceEditedThrough: dates.at(-1) ?? null };
}

export async function parseSytexSupplyExport(bytes: Uint8Array): Promise<SytexSupplyExport> {
  const rows = await readSheet(Buffer.from(bytes), { trim: false });
  return parseSytexSupplyRows(rows);
}

export function parseSytexFormRows(rows: unknown[][]): SytexFormContext[] {
  if (rows.length < 2) throw new Error("SYTEX_EXPORT_FORMS_EMPTY");
  if (rows.length > MAX_ROWS + 1) throw new Error("SYTEX_EXPORT_TOO_MANY_ROWS");
  const headers = headerKeys(rows[0]);
  for (const key of ["Código", "Nombre", "Plantilla", "Proyecto"]) {
    if (headers.filter(header => header === normalize(key)).length !== 1) throw new Error("SYTEX_EXPORT_FORM_HEADERS_INVALID");
  }
  const get = (row: unknown[], key: string) => text(row[headers.indexOf(normalize(key))]) ?? "";
  const forms = new Map<string, SytexFormContext>();
  for (const row of rows.slice(1)) {
    if (!row.some(cell => cell !== null && cell !== "")) continue;
    const code = exactFormReference(get(row, "Código")), project = get(row, "Proyecto");
    if (!code || !project) throw new Error("SYTEX_EXPORT_FORM_PROJECT_MISSING");
    const template = normalize(get(row, "Plantilla"));
    const value = { code, project, type: template.includes("correctivo") ? "CORRECTIVO" : template.includes("preventivo") ? "PREVENTIVO" : "OTRO",
      siteCode: get(row, "Códigos de sitios afectados"), siteName: get(row, "Nombres de sitios afectados"),
      description: get(row, "Nombre"), technicians: [...new Set([get(row, "Asignado a"), get(row, "Usuario colaborador")].filter(Boolean))],
      ...(headers.includes("enlace") && imageUrl(get(row, "Enlace")) ? { link: get(row, "Enlace") } : {}),
      ...(get(row, "Estado") ? { status: get(row, "Estado") } : {}),
      ...(day(get(row, "Fecha de plan")) ? { planDate: day(get(row, "Fecha de plan")) as string } : {}) };
    const previous = forms.get(code);
    if (previous && JSON.stringify(previous) !== JSON.stringify(value)) throw new Error("SYTEX_EXPORT_FORM_CONFLICT");
    forms.set(code, value);
  }
  return [...forms.values()];
}

/** Corrective tasks (TA-…) of the task export. Preventive work is already covered by its forms, so only corrective tasks are kept. */
export function parseSytexTaskRows(rows: unknown[][]): SytexFormContext[] {
  if (rows.length < 2) return [];
  if (rows.length > MAX_ROWS + 1) throw new Error("SYTEX_EXPORT_TOO_MANY_ROWS");
  const headers = headerKeys(rows[0]);
  for (const key of ["Código", "Proyecto"]) if (headers.filter((header) => header === normalize(key)).length !== 1) throw new Error("SYTEX_EXPORT_TASK_HEADERS_INVALID");
  const get = (row: unknown[], key: string) => text(row[headers.indexOf(normalize(key))]) ?? "";
  const tasks = new Map<string, SytexFormContext>();
  for (const row of rows.slice(1)) {
    if (!row.some(cell => cell !== null && cell !== "")) continue;
    const code = get(row, "Código").toUpperCase(), project = get(row, "Proyecto");
    if (!/^TA-\d{2}-\d{6}$/.test(code) || !project) continue;
    if (!/correctiv|\bmcc/.test(normalize(`${project} ${get(row, "Tipo de tarea")} ${get(row, "Plantilla de la tarea")}`))) continue;
    tasks.set(code, { code, project, type: "CORRECTIVO", siteCode: get(row, "Códigos de sitios afectados"), siteName: get(row, "Nombres de sitios afectados"),
      description: get(row, "Descripción de la tarea") || get(row, "Tipo de tarea") || code,
      technicians: [...new Set(get(row, "Personal asignado").split(/[;,]/).map(name => name.trim()).filter(Boolean))],
      ...(headers.includes("enlace") && imageUrl(get(row, "Enlace")) ? { link: get(row, "Enlace") } : {}),
      ...(get(row, "Estado") ? { status: get(row, "Estado") } : {}),
      ...(day(get(row, "Fecha de inicio plan")) ? { planDate: day(get(row, "Fecha de inicio plan")) as string } : {}) });
  }
  return [...tasks.values()];
}

export async function parseSytexFormExport(bytes: Uint8Array): Promise<SytexFormContext[]> {
  return parseSytexFormRows(await readSheet(Buffer.from(bytes), { trim: false }));
}

const ANSWER_COLUMNS = ["Formulario", "Grupo", "Índice", "Pregunta", "Respuesta", "Códigos de sitios afectados", "Nombres de sitios afectados", "Estado", "Última edición el", "Última edición por"];

/** Joins the exports of several projects: answer files feed the materials, form lists give each form its project. */
export function parseSytexExportSheets(sheets: unknown[][][]): SytexSupplyExport {
  const answers: unknown[][] = [ANSWER_COLUMNS];
  const contexts = new Map<string, SytexFormContext>();
  let answerSheets = 0;
  for (const rows of sheets) {
    if (!rows.length) throw new Error("SYTEX_EXPORT_EMPTY");
    const headers = headerKeys(rows[0]);
    if (headers.includes("pregunta") && headers.includes("respuesta")) {
      const required = ANSWER_COLUMNS.slice(0, 5).map(normalize);
      if (required.some((key) => !headers.includes(key))) throw new Error("SYTEX_EXPORT_HEADERS_MISSING");
      if (required.some((key) => headers.filter((header) => header === key).length !== 1)) throw new Error("SYTEX_EXPORT_HEADERS_AMBIGUOUS");
      const positions = ANSWER_COLUMNS.map((key) => headers.indexOf(normalize(key)));
      if (answers.length + rows.length - 1 > MAX_ROWS + 1) throw new Error("SYTEX_EXPORT_TOO_MANY_ROWS");
      for (const row of rows.slice(1)) answers.push(positions.map((position) => position < 0 ? null : row[position] ?? null));
      answerSheets++;
    } else if (headers.includes("descripcion de la tarea")) {
      for (const task of parseSytexTaskRows(rows)) contexts.set(task.code, task);
    } else if (headers.includes("codigo") && headers.includes("proyecto")) {
      for (const form of parseSytexFormRows(rows)) {
        const previous = contexts.get(form.code);
        if (previous && JSON.stringify(previous) !== JSON.stringify(form)) throw new Error("SYTEX_EXPORT_FORM_CONFLICT");
        contexts.set(form.code, form);
      }
    } else throw new Error("SYTEX_EXPORT_FILE_UNKNOWN");
  }
  if (!answerSheets) throw new Error("SYTEX_EXPORT_ANSWERS_REQUIRED");
  const parsed = parseSytexSupplyRows(answers), maintenance = parseSytexMaintenanceRows(answers);
  return { ...parsed, ...(contexts.size ? { formContexts: [...contexts.values()] } : {}), ...(maintenance.length ? { maintenance } : {}) };
}

export async function parseSytexExportBundle(files: Uint8Array[]): Promise<SytexSupplyExport> {
  const sheets: unknown[][][] = [];
  for (const bytes of files) sheets.push(await readSheet(Buffer.from(bytes), { trim: false }));
  return parseSytexExportSheets(sheets);
}

const day = (value: string | null) => value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

/**
 * Reads, from rows in ANSWER_COLUMNS order, when the generator's yearly service and the air
 * conditioner filters were last done. One fact per site, kind and form: with several units in
 * a form the oldest date counts, because that unit is the first one due.
 */
export function parseSytexMaintenanceRows(rows: unknown[][]): SytexMaintenanceFact[] {
  const facts = new Map<string, SytexMaintenanceFact>();
  for (const row of rows.slice(1)) {
    const formCode = exactFormReference(text(row[0])), siteCode = text(row[5])?.toUpperCase(), answer = text(row[4]);
    if (!formCode || !siteCode || !answer || siteCode.includes(",")) continue;
    const group = normalize((text(row[1]) ?? "").replace(/^\[#\d+\]\s*/, "")), question = normalize(text(row[3]) ?? "");
    const reportedAt = text(row[8])?.replace(" ", "T") ?? "";
    let kind: SytexMaintenanceKind, lastDate: string | null;
    if (group === "service anual" && question.includes("fecha del ultimo service anual")) { kind = "SERVICE_GE"; lastDate = day(answer); }
    else if (group === "service anual" && question.startsWith("va a realizar service anual") && normalize(answer) === "si") { kind = "SERVICE_GE"; lastDate = day(reportedAt); }
    else if (group.startsWith("aire acondicionado") && question.includes("fecha de reemplazo de los filtros")) { kind = "FILTROS_AA"; lastDate = day(answer); }
    else continue;
    if (!lastDate) continue;
    const key = JSON.stringify([siteCode, kind, formCode]), previous = facts.get(key);
    // A service done in this very form is newer than the "last service" date written in it.
    const serviceNow = kind === "SERVICE_GE" && question.startsWith("va a realizar");
    if (!previous || serviceNow || (kind === "FILTROS_AA" && lastDate < previous.lastDate)) facts.set(key, { siteCode, kind, lastDate: serviceNow && previous && previous.lastDate > lastDate ? previous.lastDate : lastDate, formCode, reportedAt: reportedAt > (previous?.reportedAt ?? "") ? reportedAt : previous?.reportedAt ?? reportedAt });
  }
  return [...facts.values()];
}
