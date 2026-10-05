export type InvoiceFile = { id: string; fileName: string; mimeType: string; byteCount: number; removedAt: string | null };
export type InvoiceLine = { id: string; description: string; quantity: string; availableQuantity: string; unit: string; version: number };
export type SupplyInvoice = {
  id: string; supplier: string; documentType: string; number: string; invoiceDate: string; amount: string; currency: string;
  version: number; mendelTransactionId: string | null; downloadedAt: string | null; uploadedAt: string | null; intraReference: string | null;
  attachments: InvoiceFile[]; lines: InvoiceLine[];
};
export type SupplyHandoff = {
  id: string; technician: string; site: string | null; quantityGiven: string; remaining: string; assignedAt: string; dueAt: string; status: string; version: number;
  line: InvoiceLine & { invoice: { id: string; number: string; supplier: string } };
};
export type SupplyMovement = { id: string; type: string; quantity: string; notes: string | null; usedAt: string; createdAt: string; reversalOf: string | null; reversedBy: { id: string } | null; allocations: Array<{ formCode: string; quantity: string; verification: string }> };
export type SupplyOverview = {
  invoices: SupplyInvoice[]; invoiceCount: number; invoicePage: number;
  handoffs: SupplyHandoff[]; handoffCount: number; handoffPage: number;
  technicians: string[];
  counts: { invoices: number; missingFiles: number; pendingDownload: number; pendingUpload: number; activeHandoffs: number; overdueHandoffs: number };
};
