import { mendelReceipt } from './mendel-receipt';
// Presentation-only control. No approval decisions or official data mutations.
export type TrayRow = {
  key: string; transactionId: string; date: string; person: string; merchant: string;
  amount: string; currency: string; budget: string; notes: string | null; approvalNotes: string;
  receipt: "SI" | "NO" | "SIN_DATO"; zone: string; locality: string; coordinator: string;
  paymentStatus: string; officialApproval: string; zoneSource: string;
  revision?: number; decisionId?: string | null; internalDecision?: string; needsReconfirmation?: boolean;
  decisionActor?: string; decisionAt?: string | null; decisionComment?: string;
  documentName?: string | null; receiptStatus?: string | null;
  snapshotHash?: string; sourceUpdatedAt?: string;
};
export type ZoneEntry = { person: string; zone: string; locality: string; coordinator: string; sourceRow: number };
export type ZoneOverrides = Readonly<Record<string, string>>;
export type TrayFilters = { query: string; zone: string; person: string; budget: string; receipt: string; from: string; to: string; hideSigned: boolean };
export const EMPTY_TRAY_FILTERS: TrayFilters = { query: "", zone: "", person: "", budget: "", receipt: "", from: "", to: "", hideSigned: true };
export const normalizeTrayText = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
const nameKey = (value: string) => normalizeTrayText(value).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();

export function resolveTrayZone(person: string, directory: readonly ZoneEntry[]): ZoneEntry | null {
  const key = nameKey(person);
  if (!key) return null;
  let matches = directory.filter(row => nameKey(row.person) === key);
  if (!matches.length) {
    const tokens = key.split(" ").sort().join(" ");
    matches = directory.filter(row => nameKey(row.person).split(" ").sort().join(" ") === tokens);
  }
  return matches.length === 1 ? matches[0] : null;
}

export function parseZoneSheet(data: unknown[][]): ZoneEntry[] {
  if (!data.length || data.length > 10001) throw new Error("La planilla está vacía o supera 10.000 filas.");
  const headers = data[0].map(normalizeTrayText);
  const col = (label: string, required = true) => {
    const positions = headers.map((v, i) => v === label ? i : -1).filter(i => i >= 0);
    if (positions.length > 1 || (required && !positions.length)) throw new Error(`Revisá la columna ${label} de la planilla.`);
    return positions[0] ?? -1;
  };
  const first = col("nombre"), last = col("apellido"), operation = col("operacion"), locality = col("zona", false), coordinator = col("coordinador", false);
  return data.slice(1).flatMap((cells, index) => {
    const text = (i: number) => typeof cells[i] === "string" ? (cells[i] as string).trim() : "";
    const person = [text(first), text(last)].filter(Boolean).join(" "), zone = text(operation);
    return person && zone ? [{ person, zone: validateTrayZone(zone), locality: text(locality), coordinator: text(coordinator), sourceRow: index + 2 }] : [];
  });
}

export function validateTrayZone(value: string): string {
  const zone = value.trim();
  if (!zone || zone.length > 80 || /[\r\n\u0000-\u001f]/.test(zone) || zone === "__UNASSIGNED__") throw new Error("Escribí una zona válida de hasta 80 caracteres.");
  return zone;
}

export function assignTrayPersonZone(rows: readonly TrayRow[], overrides: ZoneOverrides, person: string, value: string): Record<string, string> {
  if (!person || !rows.some(row => row.person === person)) throw new Error("Elegí una persona del archivo cargado.");
  const zone = validateTrayZone(value);
  return { ...overrides, [person]: zone };
}

export function decorateTrayRows(rows: readonly TrayRow[], directory: readonly ZoneEntry[], overrides: ZoneOverrides): TrayRow[] {
  return rows.map(row => {
    const match = resolveTrayZone(row.person, directory);
    const manual = Object.hasOwn(overrides, row.person) ? overrides[row.person] : null;
    return { ...row,
      zone: manual ?? (row.zone || match?.zone || ""),
      locality: row.locality || match?.locality || "", coordinator: row.coordinator || match?.coordinator || "",
      zoneSource: manual !== null ? "Asignación manual de todos los consumos de esta persona, solo en esta sesión" : row.zoneSource || (match ? `Planilla de zonas, fila ${match.sourceRow}` : "Sin identificar"),
    };
  });
}

export function hasTraySignature(row: Pick<TrayRow, "notes" | "approvalNotes">): boolean {
  return [row.notes, row.approvalNotes].some(value => /\b(?:eugenia salto|salto eugenia)\b/.test(normalizeTrayText(value)));
}

export function trayDateKey(value: string): string {
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const instant = new Date(raw);
    if (!Number.isFinite(instant.getTime())) return "";
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant).map(part => [part.type, part.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[ T])/), local = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:$|[ T])/);
  if (!iso && !local) return "";
  const [y, m, d] = iso ? [+iso[1], +iso[2], +iso[3]] : [+local![3], +local![2], +local![1]];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
}
export function trayDate(value: string): string { const day = trayDateKey(value); return day ? `${day.slice(8)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : value || "Sin fecha"; }

export function filterTray(rows: readonly TrayRow[], filters: TrayFilters): TrayRow[] {
  const query = normalizeTrayText(filters.query);
  return rows.filter(row => (!filters.hideSigned || !hasTraySignature(row))
    && (!query || normalizeTrayText([row.person, row.merchant, row.notes, row.approvalNotes, row.budget, row.transactionId].join(" ")).includes(query))
    && (!filters.zone || (filters.zone === "__UNASSIGNED__" ? !row.zone : row.zone === filters.zone))
    && (!filters.person || row.person === filters.person) && (!filters.budget || row.budget === filters.budget)
    && (!filters.receipt || (filters.receipt === 'NO' ? mendelReceipt(row).missing : filters.receipt === 'PDF' ? !!row.documentName?.trim() : filters.receipt === 'REVIEW' ? mendelReceipt(row).kind === 'REVIEW' : row.receipt === filters.receipt))
    && (!filters.from || (!!trayDateKey(row.date) && trayDateKey(row.date) >= filters.from))
    && (!filters.to || (!!trayDateKey(row.date) && trayDateKey(row.date) <= filters.to)))
    .sort((a, b) => trayDateKey(b.date).localeCompare(trayDateKey(a.date)) || a.key.localeCompare(b.key, "es", { numeric: true }));
}

export function trayMoney(raw: string, currency: string): string {
  let value = raw.trim().replace(/^(?:ARS|USD|US\$|\$)\s*/i, "").replace(/\s/g, "");
  if (!/^[+-]?\d[\d.,]*$/.test(value)) return raw || "Sin importe";
  if (value.includes(",") && value.includes(".")) {
    const decimal = value.lastIndexOf(",") > value.lastIndexOf(".") ? "," : ".", group = decimal === "," ? "." : ",";
    const [whole, fraction, extra] = value.split(decimal);
    const groups = whole.replace(/^[+-]/, "").split(group);
    if (extra !== undefined || !/^\d{1,2}$/.test(fraction) || groups.some((s, i) => !/^\d+$/.test(s) || (i > 0 && s.length !== 3))) return raw;
    value = whole.split(group).join("") + "." + fraction;
  } else if (/[.,]/.test(value)) {
    const parts = value.split(value.includes(",") ? "," : ".");
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) return raw;
    value = parts.join(".");
  }
  const amount = Number(value), code = currency.trim().toUpperCase();
  if (!Number.isFinite(amount) || Math.abs(amount) > Number.MAX_SAFE_INTEGER) return raw;
  if (/^[A-Z]{3}$/.test(code)) { try { return new Intl.NumberFormat("es-AR", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(amount); } catch { /* Preserve source below. */ } }
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(amount) + (code ? ` ${code}` : " (sin moneda)");
}

// CSV is read in the browser; full comments remain text, never parsed as approval.
export function parseTrayCsv(input: string) {
  let source = input.replace(/^\uFEFF/, ""), delimiter = ",";
  const explicit = source.match(/^sep=([,;\t])\r?\n/i);
  if (explicit) { delimiter = explicit[1]; source = source.slice(explicit[0].length); }
  else {
    const count: Record<string, number> = { ",": 0, ";": 0, "\t": 0 }; let quoted = false;
    for (let i = 0; i < source.length; i++) { const char = source[i]; if (char === '"') { if (quoted && source[i + 1] === '"') i++; else quoted = !quoted; } else if (!quoted) { if (/[\r\n]/.test(char)) break; if (char in count) count[char]++; } }
    delimiter = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    if (!count[delimiter]) throw new Error("No se detectó un CSV con columnas.");
  }
  const matrix: string[][] = []; let line: string[] = [], field = "", quoted = false, closed = false;
  const push = () => { line.push(field); if (line.some(value => value.trim())) matrix.push(line); line = []; field = ""; closed = false; if (matrix.length > 10001) throw new Error("El CSV supera 10.000 registros. Exportá un período más corto."); };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) { if (char === '"') { if (source[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += char; continue; }
    if (char === delimiter) { line.push(field); field = ""; closed = false; continue; }
    if (char === "\n" || char === "\r") { if (char === "\r" && source[i + 1] === "\n") i++; push(); continue; }
    if (closed) { if (char === " " || char === "\t") continue; throw new Error("Hay texto fuera de comillas. Revisá el CSV."); }
    if (char === '"') { if (field) throw new Error("Comillas inválidas en el CSV."); quoted = true; } else field += char;
  }
  if (quoted) throw new Error("El CSV termina con comillas sin cerrar.");
  if (field || line.length || closed) push();
  const headers = matrix.shift(); if (!headers) throw new Error("El archivo está vacío.");
  if (matrix.some(row => row.length !== headers.length)) throw new Error("Hay registros con distinta cantidad de columnas. No se cargó el archivo.");
  const normalized = headers.map(normalizeTrayText);
  const column = (names: string[], required = false) => {
    for (const name of names) { const indexes = normalized.map((value, i) => value === name ? i : -1).filter(i => i >= 0); if (indexes.length > 1) throw new Error(`Columna repetida: ${name}`); if (indexes.length) return indexes[0]; }
    if (required) throw new Error(`Falta la columna ${names[0]}.`); return -1;
  };
  const cols = { date: column(["fecha transaccion", "fecha de transaccion", "fecha"], true), person: column(["usuario", "persona"], true), merchant: column(["comercio", "merchant"], true), amount: column(["importe total", "total", "importe"], true), currency: column(["moneda", "currency"]), budget: column(["presupuesto", "budget"]), notes: column(["notas", "nota de la transaccion", "nota"]), approval: column(["nota de aprobacion", "notas de aprobacion"]), receipt: column(["hay ticket", "tiene ticket"]), id: column(["id transaccion", "id de transaccion"]), zone: column(["zona", "region"]), locality: column(["localidad (excel)", "localidad"]), coordinator: column(["coordinador"]), zoneSource: column(["fuente zona"]), payment: column(["estado transaccion", "estado de transaccion"]), official: column(["estado de aprobacion", "approval status"]) };
  const document = column(['nombre pdf']), receiptStatus = column(['estado comprobacion']);
  const sourceFields = ([['notes', cols.notes], ['approvalNotes', cols.approval], ['receipt', cols.receipt], ['documentName', document], ['receiptStatus', receiptStatus]] as const).filter(([, index]) => index >= 0).map(([field]) => field);
  return { notesAvailable: cols.notes >= 0 || cols.approval >= 0, sourceFields, rows: matrix.map((cells, i): TrayRow => {
    const get = (index: number) => index < 0 ? "" : cells[index], receipt = normalizeTrayText(get(cols.receipt));
    return { key: `csv-${i}`, transactionId: get(cols.id).trim(), date: get(cols.date), person: get(cols.person).trim(), merchant: get(cols.merchant), amount: get(cols.amount), currency: get(cols.currency), budget: get(cols.budget).trim(), notes: cols.notes >= 0 ? get(cols.notes) : null, approvalNotes: get(cols.approval), receipt: ["si", "yes", "true", "1"].includes(receipt) ? "SI" : ["no", "false", "0"].includes(receipt) ? "NO" : "SIN_DATO", zone: get(cols.zone).trim(), locality: get(cols.locality), coordinator: get(cols.coordinator), paymentStatus: get(cols.payment), officialApproval: get(cols.official), zoneSource: get(cols.zoneSource) || (get(cols.zone).trim() ? "Columna del CSV" : ""), ...(document >= 0 ? { documentName: get(document).trim() || null } : {}), ...(receiptStatus >= 0 ? { receiptStatus: get(receiptStatus).trim() || null } : {}) };
  }) };
}

export function trayMessage(rows: readonly TrayRow[], title: string): string {
  return `Hola, paso pendientes de Mendel.\n${title}\n\n` + rows.map(row => `• ${trayDate(row.date)} | ${row.person || "Sin persona"} | ${row.merchant || "Sin comercio"} | ${trayMoney(row.amount, row.currency)} | ${row.budget || "Sin presupuesto"} | Comprobante: ${mendelReceipt(row).label}`).join("\n") + "\n\n¿Me confirmás si fueron autorizados y quién dio el OK? Pedí rendición solo donde dice No informado en CSV. Los PDF informados y los datos contradictorios requieren revisión; Sin dato no significa que falte.";
}
