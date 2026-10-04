import { describe, expect, it } from "vitest";
import { reconcileSupplyForms, type MendelSupplyTransaction } from "./supply-reconciliation";

function transaction(overrides: Partial<MendelSupplyTransaction> = {}): MendelSupplyTransaction {
  return {
    transactionId: "purchase-1", transactionDate: new Date("2026-10-04T12:00:00Z"),
    merchant: "Proveedor", totalAmount: "100.00", currency: "ARS",
    referenceCode: null, budgetId: null, transactionStatus: null,
    hasReceipt: true, receiptStatus: "CON COMPROBANTES", reconciliationStatus: "PENDING",
    formReferences: [], ...overrides,
  };
}
const supplies = [{ formulario: "FO-26-610350", quantity: 110 }, { formulario: "FO-26-610351", quantity: 65 }];

describe("supply reconciliation by exact form reference", () => {
  it("relates one purchase to several forms without changing quantities or confirming consumption", () => {
    const result = reconcileSupplyForms(supplies, [transaction({ formReferences: supplies.map((item) => ({ formCode: item.formulario })) })]);
    expect(result.map((item) => item.quantity)).toEqual([110, 65]);
    for (const item of result) {
      expect(item.mendel.status).toBe("MATCHED");
      expect(item.mendel.candidateCount).toBe(1);
      expect(item.mendel.matchKey).toBe("NOTES_FORM_REFERENCE");
      expect(item.mendel.consumptionConfirmed).toBe(false);
    }
  });

  it("never treats a transaction ID or budget ID as a form reference", () => {
    const result = reconcileSupplyForms(supplies, [transaction({ transactionId: supplies[0].formulario, budgetId: supplies[1].formulario })]);
    expect(result.map((item) => item.mendel.status)).toEqual(["UNMATCHED", "UNMATCHED"]);
  });

  it("deduplicates a purchase found in both referenceCode and notes", () => {
    const result = reconcileSupplyForms(supplies, [transaction({ referenceCode: " fo-26-610350 ", formReferences: [{ formCode: supplies[0].formulario }] })]);
    expect(result[0].mendel.candidateCount).toBe(1);
    expect(result[0].mendel.matchKey).toBe("REFERENCE_CODE");
    expect(result[1].mendel.status).toBe("UNMATCHED");
  });

  it("keeps all purchases for review when several reference the same form", () => {
    const result = reconcileSupplyForms(supplies, [
      transaction({ referenceCode: supplies[0].formulario }),
      transaction({ transactionId: "purchase-2", formReferences: [{ formCode: supplies[0].formulario }] }),
    ]);
    expect(result[0].quantity).toBe(110);
    expect(result[0].mendel.status).toBe("AMBIGUOUS");
    expect(result[0].mendel.transaction).toBeNull();
    expect(result[0].mendel.candidates.map((item) => item.transactionId)).toEqual(["purchase-1", "purchase-2"]);
  });

  it("does not use partial or malformed reference codes", () => {
    const result = reconcileSupplyForms(supplies, [transaction({ referenceCode: "FO-26-6103507", formReferences: [{ formCode: "FO-26-61035" }] })]);
    expect(result[0].mendel.status).toBe("UNMATCHED");
  });
});
