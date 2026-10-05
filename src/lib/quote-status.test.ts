import { describe, expect, it } from "vitest";
import { QuoteStatus } from "@/contracts";
import { isFinalQuoteStatus, isPendingQuoteStatus, normalizeQuoteStatus } from "./quote-status";

describe("quote status normalization", () => {
  it.each([
    ["ABIERTA", QuoteStatus.OPEN],
    ["OPEN", QuoteStatus.OPEN],
    ["EN PROCESO", QuoteStatus.IN_PROGRESS],
    ["IN_PROGRESS", QuoteStatus.IN_PROGRESS],
    ["PROCESSING", QuoteStatus.IN_PROGRESS],
    ["EN ESPERA", QuoteStatus.WAITING],
    ["WAITING", QuoteStatus.WAITING],
    ["COMPLETADA CON PENDIENTES", QuoteStatus.COMPLETED_WITH_PENDING],
    ["COMPLETED_WITH_PENDING", QuoteStatus.COMPLETED_WITH_PENDING],
    ["COMPLETADA", QuoteStatus.COMPLETED],
    ["COMPLETED", QuoteStatus.COMPLETED],
    ["Aprobada", QuoteStatus.COMPLETED],
    ["Aprobado", QuoteStatus.COMPLETED],
    ["Aprobada con pendientes", QuoteStatus.COMPLETED_WITH_PENDING],
  ])("maps %s to the operational state", (raw, expected) => {
    expect(normalizeQuoteStatus(raw)).toBe(expected);
  });

  it("treats every non-completed operational state as pending", () => {
    expect(isPendingQuoteStatus(QuoteStatus.OPEN)).toBe(true);
    expect(isPendingQuoteStatus(QuoteStatus.IN_PROGRESS)).toBe(true);
    expect(isPendingQuoteStatus(QuoteStatus.WAITING)).toBe(true);
    expect(isPendingQuoteStatus(QuoteStatus.COMPLETED_WITH_PENDING)).toBe(true);
    expect(isPendingQuoteStatus(QuoteStatus.COMPLETED)).toBe(false);
    expect(isFinalQuoteStatus(QuoteStatus.COMPLETED)).toBe(true);
  });

  it("keeps unknown source values safe as pending", () => {
    expect(normalizeQuoteStatus("estado nuevo de Sytex")).toBe(QuoteStatus.OPEN);
  });
});
