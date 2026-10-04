import { exactFormReference } from "./form-references";

export type MendelSupplyTransaction = {
  transactionId: string;
  transactionDate: Date;
  merchant: string | null;
  totalAmount: { toString(): string };
  currency: string;
  referenceCode: string | null;
  budgetId: string | null;
  transactionStatus: string | null;
  hasReceipt: boolean | null;
  receiptStatus: string | null;
  reconciliationStatus: string;
  formReferences: Array<{ formCode: string }>;
};

type MatchKey = "REFERENCE_CODE" | "NOTES_FORM_REFERENCE";

export function reconcileSupplyForms<T extends { formulario: string }>(supplies: T[], transactions: MendelSupplyTransaction[]) {
  const index = new Map<string, Map<string, { row: MendelSupplyTransaction; matchKey: MatchKey }>>();
  const add = (value: string | null, matchKey: MatchKey, row: MendelSupplyTransaction) => {
    const form = exactFormReference(value);
    if (!form) return;
    const bucket = index.get(form) ?? new Map();
    if (!bucket.has(row.transactionId)) bucket.set(row.transactionId, { row, matchKey });
    index.set(form, bucket);
  };
  for (const row of transactions) {
    add(row.referenceCode, "REFERENCE_CODE", row);
    for (const reference of row.formReferences) add(reference.formCode, "NOTES_FORM_REFERENCE", row);
  }
  return supplies.map((item) => {
    const form = exactFormReference(item.formulario);
    const candidates = [...(form ? index.get(form)?.values() ?? [] : [])].map(({ row, matchKey }) => ({
      transactionId: row.transactionId,
      transactionDate: row.transactionDate.toISOString(),
      merchant: row.merchant,
      totalAmount: row.totalAmount.toString(),
      currency: row.currency,
      hasReceipt: row.hasReceipt,
      receiptStatus: row.receiptStatus,
      reconciliationStatus: row.reconciliationStatus,
      matchKey,
    }));
    const match = candidates.length === 1 ? candidates[0] : null;
    return {
      ...item,
      mendel: {
        status: candidates.length === 1 ? "MATCHED" : candidates.length > 1 ? "AMBIGUOUS" : "UNMATCHED",
        matchKey: match?.matchKey ?? null,
        transactionId: match?.transactionId ?? null,
        transaction: match,
        candidates,
        candidateCount: candidates.length,
        consumptionConfirmed: false,
      },
    };
  });
}
