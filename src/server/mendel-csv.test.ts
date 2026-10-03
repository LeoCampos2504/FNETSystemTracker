import { describe, expect, it } from "vitest";
import { parseMendelCsv } from "@/server/mendel-csv";

describe("parseMendelCsv", () => {
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
});
