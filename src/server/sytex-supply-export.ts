import { readSheet } from "read-excel-file/node";
import { exactFormReference } from "./form-references";

type Issue = { line: number; code: string };
type SourceAnswer = { line: number; index: string; question: string; answer: string | null; editedAt: string | null; editor: string | null };
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
};
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " "); }
function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!(value instanceof Date) && !["string", "number", "boolean"].includes(typeof value)) return null;
  const result = value instanceof Date ? value.toISOString().replace(/Z$/, "") : String(value).trim();
  return result || null;
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
function role(question: string): "description" | "quantity" | "provider" | "image" | null {
  const label = normalize(question).replace(/[:?¿]+/g, "");
  if (/^descripcion(?: del| de)?(?: insumo| material)/.test(label)) return "description";
  if (/^cantidad(?: utilizada)?$/.test(label)) return "quantity";
  if (/^(?:provisto por|proveedor)$/.test(label)) return "provider";
  if (/^(?:foto|imagen)(?: del| de)?(?: insumo| material)/.test(label)) return "image";
  return null;
}

export function parseSytexSupplyRows(rows: unknown[][]): SytexSupplyExport {
  if (rows.length < 2) throw new Error("SYTEX_EXPORT_EMPTY");
  if (rows.length > 50_001) throw new Error("SYTEX_EXPORT_TOO_MANY_ROWS");
  const headers = rows[0].map((value) => normalize(text(value) ?? ""));
  const required = ["Formulario", "Grupo", "Índice", "Pregunta", "Respuesta"];
  if (required.some((key) => !headers.includes(normalize(key)))) throw new Error("SYTEX_EXPORT_HEADERS_MISSING");
  if (required.some((key) => headers.filter((header) => header === normalize(key)).length !== 1)) throw new Error("SYTEX_EXPORT_HEADERS_AMBIGUOUS");
  const get = (row: unknown[], key: string) => text(row[headers.indexOf(normalize(key))]);
  const buckets = new Map<string, SytexExportItem>();
  const seen = new Map<string, string>();
  const errors: Issue[] = [], warnings: Issue[] = [];
  const forms = new Set<string>(), dates: string[] = [];
  let answerCount = 0;
  rows.slice(1).forEach((row, offset) => {
    if (!row.some((cell) => cell !== null && cell !== "")) return;
    answerCount++;
    const line = offset + 2, form = exactFormReference(get(row, "Formulario"));
    if (form) forms.add(form);
    const editedAt = get(row, "Última edición el");
    if (editedAt && /^\d{4}-\d{2}-\d{2}T/.test(editedAt)) dates.push(editedAt);
    const group = get(row, "Grupo"), index = get(row, "Índice"), question = get(row, "Pregunta") ?? "";
    const field = role(question);
    if (!group || !/(?:insumo|material)/.test(normalize(group)) || !field) return;
    const answer = get(row, "Respuesta");
    if (!answer) return;
    const stem = index?.match(/^(.+)\.\d+$/)?.[1];
    if (!form || !index || !stem) { errors.push({ line, code: "ITEM_IDENTITY_INVALID" }); return; }
    const key = JSON.stringify([form, group, stem]);
    const fieldKey = JSON.stringify([form, group, stem, field]);
    const previous = seen.get(fieldKey);
    if (previous !== undefined) {
      if (previous !== answer) errors.push({ line, code: "ITEM_FIELD_CONFLICT" });
      else warnings.push({ line, code: "DUPLICATE_ANSWER_SKIPPED" });
      return;
    }
    seen.set(fieldKey, answer);
    const item = buckets.get(key) ?? {
      formulario: form, grupo: group, indice: stem, description: null, quantity: null, provider: null,
      siteCode: get(row, "Códigos de sitios afectados"), siteName: get(row, "Nombres de sitios afectados"), status: get(row, "Estado"),
      image: null, imageDeclared: false, lastEditedBy: null, sourceEditedAt: null, sourceAnswers: [],
    };
    if (field === "quantity") {
      item.quantity = quantity(answer);
      if (item.quantity === null) warnings.push({ line, code: "QUANTITY_NOT_NUMERIC" });
    } else if (field === "image") {
      item.image = imageUrl(answer);
      item.imageDeclared = Boolean(item.image) || ["ok", "si", "true"].includes(normalize(answer));
      if (item.imageDeclared && !item.image) warnings.push({ line, code: "IMAGE_FILE_MISSING" });
    } else item[field] = answer;
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
