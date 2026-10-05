import { QuoteStatus } from "@/contracts";

function normalizedQuoteStatus(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normalizes the operational QO states without changing the source value.
 * Unknown values remain pending-safe by mapping to OPEN.
 */
export function normalizeQuoteStatus(value: string | null | undefined): QuoteStatus {
  const status = normalizedQuoteStatus(value);
  if (status.includes("NO APROBAD") || status.includes("DESAPROBAD") || status.includes("DISAPPROVED") || status.includes("RECHAZ")) return QuoteStatus.OPEN;
  if ((status.includes("COMPLET") || status.includes("APROBAD") || status.includes("APPROVED")) && (status.includes("PENDIENT") || status.includes("PENDING"))) return QuoteStatus.COMPLETED_WITH_PENDING;
  if (status.includes("WAIT") || status.includes("ESPERA")) return QuoteStatus.WAITING;
  if (status.includes("IN PROGRESS") || status.includes("PROCESS") || status.includes("PROCESO")) return QuoteStatus.IN_PROGRESS;
  if (status.includes("COMPLET") || status.includes("APROBAD") || status.includes("APPROVED") || status.includes("FINALIZ") || status.includes("CERRAD")) return QuoteStatus.COMPLETED;
  if (status.includes("OPEN") || status.includes("ABIERT")) return QuoteStatus.OPEN;
  return QuoteStatus.OPEN;
}

export function isPendingQuoteStatus(status: QuoteStatus): boolean {
  return status !== QuoteStatus.COMPLETED;
}

export function isFinalQuoteStatus(status: QuoteStatus): boolean {
  return status === QuoteStatus.COMPLETED;
}
