/** Source evidence only: a filename is not a downloaded/validated document or an approval. */
export type ReceiptEvidence = { receipt: 'SI' | 'NO' | 'SIN_DATO'; documentName?: string | null; receiptStatus?: string | null };
export function mendelReceipt(evidence: ReceiptEvidence) {
  const hasPdf = !!evidence.documentName?.trim();
  const status = (evidence.receiptStatus ?? '').trim().toUpperCase();
  if (hasPdf) return { kind: evidence.receipt === 'SI' ? 'PDF' : 'REVIEW', label: evidence.receipt === 'SI' ? 'PDF informado' : 'PDF informado · revisar', missing: false } as const;
  if (status === 'NO REQUIERE') return { kind: 'NOT_REQUIRED', label: 'No requiere · según CSV', missing: false } as const;
  if (evidence.receipt === 'SI') return { kind: 'TICKET', label: 'Ticket informado', missing: false } as const;
  if (evidence.receipt === 'NO' && status === 'FINALIZADA') return { kind: 'REVIEW', label: 'Datos de comprobante · revisar', missing: false } as const;
  if (evidence.receipt === 'NO') return { kind: 'MISSING', label: 'No informado en CSV', missing: true } as const;
  return { kind: 'UNKNOWN', label: 'Sin dato', missing: false } as const;
}
