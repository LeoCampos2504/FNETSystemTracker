import { describe, expect, it } from "vitest";
import { parseMendelCsv } from "@/server/mendel-csv";

describe("parseMendelCsv", () => {
  it("distinguishes two full IDs sharing a short ID", () => {
    const csv = 'ID Transaccion,ID Completo Transaccion,Fecha transaccion,Importe Total,Moneda\nABC-123,ABC-123-ONE,2026/09/25,1,ARS\nABC-123,ABC-123-TWO,2026/09/25,1,ARS';
    const result = parseMendelCsv(new TextEncoder().encode(csv));
    expect(result.invalidRowCount).toBe(0);
    expect(result.rows.map(row => row.fullId)).toEqual(['ABC-123-ONE', 'ABC-123-TWO']);
    expect(result.duplicateCount).toBe(0);
  });

  it("rejects a full ID that does not match the provided abbreviated ID", () => {
    const csv = 'ID Transaccion,ID Completo Transaccion,Fecha transaccion,Importe Total,Moneda\nABC-123,XYZ-123-ONE,2026/09/25,1,ARS';
    const result = parseMendelCsv(new TextEncoder().encode(csv));
    expect(result.invalidRowCount).toBe(1);
    expect(result.errors[0].fields).toContain('ID Completo Transaccion no coincide con el ID abreviado');
  });
  it("reads quoted values, Argentina timestamps, decimals, and skips identical duplicate IDs", () => {
    const csv = [
      '"ID Transaccion","Fecha transaccion","Fecha confirmacion","Usuario","Comercio","Importe Total","Moneda","Hay ticket","Estado comprobacion"',
      '"ABC-123","2026/09/25 08:33","","Ana, María","Comercio ""Central""",1234.50,"ARS","SI","CON COMPROBANTES"',
      '"ABC-123","2026/09/25 08:33","","Ana, María","Comercio ""Central""",1234.50,"ARS","SI","CON COMPROBANTES"',
    ].join("\r\n");
    const result = parseMendelCsv(new TextEncoder().encode(csv));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].userName).toBe("Ana, María");
    expect(result.rows[0].merchant).toBe('Comercio "Central"');
    expect(result.rows[0].totalAmount).toBe("1234.50");
    expect(result.rows[0].hasReceipt).toBe(true);
    expect(result.duplicateCount).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("rejects a duplicate identifier with conflicting transaction data", () => {
    const csv = [
      '"ID Transaccion","Fecha transaccion","Importe Total","Moneda"',
      '"ABC-123","2026/09/25 08:33",1234.50,"ARS"',
      '"ABC-123","2026/09/25 08:33",999.00,"ARS"',
    ].join("\n");
    const result = parseMendelCsv(new TextEncoder().encode(csv));
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([{ line: 3, fields: ["ID Transaccion duplicado con datos distintos"] }]);
  });

  it("rejects missing required headers and malformed quotes", () => {
    expect(() => parseMendelCsv(new TextEncoder().encode('"Fecha","Importe"\n"x","1"'))).toThrow("CSV_REQUIRED_HEADERS_MISSING");
    expect(() => parseMendelCsv(new TextEncoder().encode('"ID Transaccion","Fecha transaccion","Importe Total","Moneda"\n"ABC-123,2026/09/25,1,ARS'))).toThrow("CSV_INVALID_QUOTE");
  });

  it("extracts distinct FO references and retains the source notes", () => {
    const csv = [
      '"ID Transaccion","Fecha transaccion","Importe Total","Moneda","Notas"',
      '"ABC-123","2026/09/25 08:33",1234.50,"ARS","Técnico: fo-26-610350, FO-26-610351 y FO-26-610350; correo privado"',
    ].join("\n");
    const result = parseMendelCsv(new TextEncoder().encode(csv));
    expect(result.errors).toEqual([]);
    expect(result.rows[0].formReferences).toEqual(["FO-26-610350", "FO-26-610351"]);
    expect(result.rows[0].sourceComment).toContain("correo privado");
  });

  it("does not turn malformed longer form numbers into valid references", () => {
    const csv = 'ID Transaccion,Fecha transaccion,Importe Total,Moneda,Notas\nABC-123,2026/09/25 08:33,1,ARS,FO-26-6103507';
    expect(parseMendelCsv(new TextEncoder().encode(csv)).rows[0].formReferences).toEqual([]);
  });

  it("distinguishes missing notes from an explicitly empty notes column", () => {
    const csv = 'ID Transaccion,Fecha transaccion,Importe Total,Moneda\nABC-123,2026/09/25 08:33,1,ARS';
    expect(parseMendelCsv(new TextEncoder().encode(csv)).rows[0]).not.toHaveProperty("formReferences");
    const withEmptyNotes = 'ID Transaccion,Fecha transaccion,Importe Total,Moneda,Notas\nABC-123,2026/09/25 08:33,1,ARS,';
    expect(parseMendelCsv(new TextEncoder().encode(withEmptyNotes)).rows[0].formReferences).toEqual([]);
  });
});
