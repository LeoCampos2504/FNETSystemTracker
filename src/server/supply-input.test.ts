import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { consumptionTotal, remainingAfterUse, day, positiveQuantity, movementInput, invoiceInput } from "./supply-input";
import { inspectFile } from "./services/supply-control";
const d = (n: string) => new Prisma.Decimal(n);
describe("real supplies input and accounting", () => {
  it("uses exact decimal balances across multiple forms", () => {
    const total = consumptionTotal([{ formCode: "FO-26-000001", quantity: "0.1" }, { formCode: "FO-26-000002", quantity: "0.2" }]);
    expect(total.toString()).toBe("0.3"); expect(remainingAfterUse(d("0.3"), total, true).toString()).toBe("0");
  });
  it("rejects consuming more than the remaining material", () => { expect(() => remainingAfterUse(d("1"), d("1.001"), false)).toThrow("INSUFFICIENT_REMAINING"); });
  it("cannot exhaust a handoff while quantities are unaccounted", () => { expect(() => remainingAfterUse(d("2"), d("1"), true)).toThrow("EXHAUSTED_REQUIRES_ALL_REMAINING"); });
  it("requires a single allocation per exact FO", () => { expect(() => consumptionTotal([{ formCode: "FO-26-000001", quantity: "1" }, { formCode: "FO-26-000001", quantity: "2" }])).toThrow("DUPLICATE_FORM"); });
  it.each(["0", "-1", "1e3", "1,5", "0.0001", "Infinity", "1000000000000"])("rejects unsafe quantity %s", (value) => { expect(positiveQuantity.safeParse(value).success).toBe(false); });
  it("rejects dates that roll over into a different month", () => { expect(day.safeParse("2026-02-31").success).toBe(false); expect(day.safeParse("2026-02-28").success).toBe(true); });
  it("does not treat task identifiers as forms", () => { expect(movementInput.safeParse({ action: "CONSUMPTION", requestKey: crypto.randomUUID(), version: 0, usedDate: "2026-10-04", exhausted: true, forms: [{ formCode: "TA-26-000001", quantity: "1" }] }).success).toBe(false); });
  it("does not accept unsupported money or fabricated floating amounts", () => { expect(invoiceInput.safeParse({ requestKey: crypto.randomUUID(), supplier: "Proveedor", documentType: "A", number: "123", invoiceDate: "2026-10-04", amount: "100.001", currency: "ARS", lines: [] }).success).toBe(false); });
  it("validates file signatures instead of trusting an extension", () => { expect(() => inspectFile(new TextEncoder().encode('<script>bad</script>'), 'receipt.pdf')).toThrow("FILE_TYPE_INVALID"); expect(inspectFile(new TextEncoder().encode('%PDF-1.7\n'), '../../receipt.html').mimeType).toBe('application/pdf'); expect(inspectFile(new TextEncoder().encode('%PDF-1.7\n'), '../../receipt.html').fileName).not.toContain('/'); });
});
