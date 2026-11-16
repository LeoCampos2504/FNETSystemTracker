import type { MendelTransactionImport } from './mendel-csv';

export function resolveMendelIdentities(rows: MendelTransactionImport[], recordNumbers: number[], existingIds: Set<string>, mappings: Array<{ transactionId: string; fullId: string | null }>) {
  const byFull = new Map(mappings.filter(m => m.fullId).map(m => [m.fullId!, m.transactionId]));
  const byInternal = new Map(mappings.map(m => [m.transactionId, m.fullId]));
  const resolved: MendelTransactionImport[] = [], records: number[] = [];
  const ambiguous: Array<{ line: number; fields: string[] }> = [];
  rows.forEach((row, index) => {
    const full = row.fullId!;
    const existing = byFull.get(full);
    if (!existing && row.transactionId !== full && existingIds.has(row.transactionId) && !byInternal.get(row.transactionId)) {
      ambiguous.push({ line: recordNumbers[index], fields: ['ID abreviado anterior sin ID completo: requiere revisión'] });
      return;
    }
    resolved.push({ ...row, transactionId: existing ?? full });
    records.push(recordNumbers[index]);
  });
  return { rows: resolved, records, ambiguous };
}
