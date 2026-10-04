export type MendelTransactionImport = {
  transactionId: string;
  transactionDate: Date;
  confirmationDate: Date | null;
  userName: string | null;
  merchant: string | null;
  totalAmount: string;
  currency: string;
  internationalAmount: string | null;
  internationalCurrency: string | null;
  bankFee: string | null;
  budget: string | null;
  budgetId: string | null;
  paymentMethod: string | null;
  transactionType: string | null;
  transactionStatus: string | null;
  referenceCode: string | null;
  paymentOrigin: string | null;
  channel: string | null;
  merchantCategory: string | null;
  transactionCategory: string | null;
  hasReceipt: boolean | null;
  documentName: string | null;
  invoiceTotal: string | null;
  invoiceDifference: string | null;
  receiptStatus: string | null;
  vat: string | null;
  grossIncomeTax: string | null;
  otherTaxes: string | null;
  exemptAmount: string | null;
  nonTaxedAmount: string | null;
};

export type MendelCsvParseResult = {
  rows: MendelTransactionImport[];
  errors: Array<{ line: number; fields: string[] }>;
  invalidRowCount: number;
  duplicateCount: number;
};

function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes).replace(/^\uFEFF/, "");
  }
}

function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') { quoted = false; closedQuote = true; }
      else field += char;
      continue;
    }
    if (closedQuote) {
      if (char === ",") { row.push(field); field = ""; closedQuote = false; }
      else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i += 1;
        row.push(field);
        if (row.some((cell) => cell.length > 0)) records.push(row);
        row = []; field = ""; closedQuote = false;
      } else if (char !== " " && char !== "\t") throw new Error("CSV_INVALID_QUOTE");
    }
    else if (char === '"' && field.length === 0) quoted = true;
    else if (char === '"') throw new Error("CSV_INVALID_QUOTE");
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) records.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new Error("CSV_INVALID_QUOTE");
  row.push(field);
  if (row.some((cell) => cell.length > 0)) records.push(row);
  return records;
}

function headerKey(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clean(value: string | undefined, maxLength: number): string | null {
  const cleaned = value?.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function parseAmount(value: string | undefined): string | null {
  const raw = value?.trim().replace(/[\s$]/g, "");
  if (!raw) return null;
  let normalized = raw;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
      ? normalized.replace(/\./g, "").replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (normalized.includes(",")) {
    normalized = /,\d{1,2}$/.test(normalized) ? normalized.replace(",", ".") : normalized.replace(/,/g, "");
  }
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  return normalized;
}

function parseDate(value: string | undefined): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})[/-](\d{2})[/-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  const localDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  if (localDate.getUTCFullYear() !== Number(year) || localDate.getUTCMonth() !== Number(month) - 1 || localDate.getUTCDate() !== Number(day)) return null;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseBoolean(value: string | undefined): boolean | null {
  const normalized = value?.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (["SI", "SÍ", "YES", "TRUE", "1"].includes(normalized ?? "")) return true;
  if (["NO", "FALSE", "0"].includes(normalized ?? "")) return false;
  return null;
}

export function parseMendelCsv(bytes: Uint8Array): MendelCsvParseResult {
  const records = parseCsv(decode(bytes));
  if (records.length < 2) throw new Error("CSV_EMPTY");
  const headers = records[0].map(headerKey);
  const index = (name: string) => headers.indexOf(headerKey(name));
  const required = ["ID Transaccion", "Fecha transaccion", "Importe Total", "Moneda"];
  const absent = required.filter((name) => index(name) < 0);
  if (absent.length) throw new Error("CSV_REQUIRED_HEADERS_MISSING");
  const value = (record: string[], name: string) => {
    const i = index(name);
    return i < 0 ? undefined : record[i];
  };
  const rows: MendelTransactionImport[] = [];
  const errors: MendelCsvParseResult["errors"] = [];
  const seen = new Map<string, string>();
  let invalidRowCount = 0;
  let duplicateCount = 0;

  for (let offset = 1; offset < records.length; offset += 1) {
    const record = records[offset];
    const line = offset + 1;
    const fields: string[] = [];
    const transactionId = clean(value(record, "ID Transaccion"), 80)?.toUpperCase() ?? null;
    const transactionDate = parseDate(value(record, "Fecha transaccion"));
    const totalAmount = parseAmount(value(record, "Importe Total"));
    const currency = clean(value(record, "Moneda"), 3)?.toUpperCase() ?? null;
    if (!transactionId) fields.push("ID Transaccion");
    if (!transactionDate) fields.push("Fecha transaccion");
    if (!totalAmount) fields.push("Importe Total");
    if (!currency || currency.length !== 3) fields.push("Moneda");
    const amountFields = ["Importe internacional", "Comision bancaria (en moneda nacional)", "Importe total de la factura", "Diferencia importe total y facturado", "IVA", "IIBB", "Otros impuestos", "Importe exento", "Importe no gravado"];
    const parsedAmounts = amountFields.map((name) => {
      const raw = value(record, name);
      return raw?.trim() ? parseAmount(raw) : null;
    });
    amountFields.forEach((name, i) => {
      if (value(record, name)?.trim() && parsedAmounts[i] === null) fields.push(name);
    });
    const confirmationRaw = value(record, "Fecha confirmacion");
    const confirmationDate = confirmationRaw?.trim() ? parseDate(confirmationRaw) : null;
    if (confirmationRaw?.trim() && !confirmationDate) fields.push("Fecha confirmacion");
    if (fields.length) {
      invalidRowCount += 1;
      if (errors.length < 100) errors.push({ line, fields });
      continue;
    }

    const row: MendelTransactionImport = {
      transactionId: transactionId!, transactionDate: transactionDate!, confirmationDate,
      userName: clean(value(record, "Usuario"), 200), merchant: clean(value(record, "Comercio"), 250),
      totalAmount: totalAmount!, currency: currency!,
      internationalAmount: parsedAmounts[0], internationalCurrency: clean(value(record, "Moneda internacional"), 3)?.toUpperCase() ?? null,
      bankFee: parsedAmounts[1], budget: clean(value(record, "Presupuesto"), 200), budgetId: clean(value(record, "ID presupuesto"), 100),
      paymentMethod: clean(value(record, "Metodo de pago"), 100), transactionType: clean(value(record, "Tipo Transaccion"), 100),
      transactionStatus: clean(value(record, "Estado transaccion"), 100), referenceCode: clean(value(record, "Codigo de referencia"), 100),
      paymentOrigin: clean(value(record, "Origen del pago"), 100), channel: clean(value(record, "Canal"), 100),
      merchantCategory: clean(value(record, "Categoria comercio"), 150), transactionCategory: clean(value(record, "Categoria transaccion"), 150),
      hasReceipt: parseBoolean(value(record, "Hay ticket")), documentName: clean(value(record, "Nombre PDF"), 250),
      invoiceTotal: parsedAmounts[2], invoiceDifference: parsedAmounts[3], receiptStatus: clean(value(record, "Estado comprobacion"), 150),
      vat: parsedAmounts[4], grossIncomeTax: parsedAmounts[5], otherTaxes: parsedAmounts[6], exemptAmount: parsedAmounts[7], nonTaxedAmount: parsedAmounts[8],
    };
    const serialized = JSON.stringify(row);
    const previous = seen.get(row.transactionId);
    if (previous !== undefined) {
      if (previous !== serialized) {
        invalidRowCount += 1;
        if (errors.length < 100) errors.push({ line, fields: ["ID Transaccion duplicado con datos distintos"] });
      } else duplicateCount += 1;
      continue;
    }
    seen.set(row.transactionId, serialized);
    rows.push(row);
  }
  return { rows, errors, invalidRowCount, duplicateCount };
}
