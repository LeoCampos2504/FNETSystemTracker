import { trayDateKey, type TrayRow } from './mendel-bandeja';

export const EVIDENCE_FIELDS = ['notes', 'approvalNotes', 'receipt', 'documentName', 'receiptStatus'] as const;
export type EvidenceField = typeof EVIDENCE_FIELDS[number];
export type SourcePatch = Partial<Pick<TrayRow, EvidenceField>>;
export type SourceRefreshRow = Pick<TrayRow, 'transactionId' | 'date' | 'person' | 'merchant' | 'amount' | 'currency' | 'budget'> & { expectedSnapshotHash: string; patch: SourcePatch };
export type SourceRefreshResult = { updated: number; unchanged: number; issues: { transactionId: string; reason: string }[] };

/** No filters here: an already shared expense must update even after its signature hides it. */
export function buildMendelSyncPlan(csvRows: TrayRow[], sharedRows: TrayRow[], visibleRows: TrayRow[], fields: readonly EvidenceField[]) {
  const ids = new Set<string>();
  for (const row of csvRows) {
    if (row.transactionId && ids.has(row.transactionId)) throw new Error('El CSV repite un ID de transacción. No se actualizó ningún gasto.');
    if (row.transactionId) ids.add(row.transactionId);
  }
  const shared = new Map(sharedRows.map(row => [row.transactionId, row]));
  const updates: SourceRefreshRow[] = csvRows.flatMap(row => {
    const previous = shared.get(row.transactionId);
    if (!previous || !fields.length) return [];
    if (!previous.snapshotHash) throw new Error('Recargá el control compartido antes de cargar este CSV: falta la versión de origen.');
    const { transactionId, date, person, merchant, amount, currency, budget } = row;
    const patch = Object.fromEntries(fields.filter(field => row[field] !== undefined).map(field => [field, row[field]])) as SourcePatch;
    return [{ transactionId, date, person, merchant, amount, currency, budget, expectedSnapshotHash: previous.snapshotHash, patch }];
  });
  return { updates, newRows: visibleRows.filter(row => !shared.has(row.transactionId)) };
}

function amountKey(value: string): string | null {
  // Preserve exact money, never round through Number. Ambiguous formats fail closed.
  let raw = value.trim().replace(/[\s$]/g, '');
  if (raw.includes(',') && raw.includes('.')) {
    const separator = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
    const group = separator === ',' ? '.' : ',';
    const parts = raw.split(separator);
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1]) || !/^[+-]?\d{1,3}(?:[.,]\d{3})+$/.test(parts[0])) return null;
    raw = parts[0].split(group).join('') + '.' + parts[1];
  } else raw = raw.replace(',', '.');
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const negative = raw.startsWith('-'), [integer, fraction = ''] = raw.replace(/^[+-]/, '').split('.');
  const whole = integer.replace(/^0+(?=\d)/, ''), decimals = fraction.padEnd(2, '0');
  return `${negative && (whole !== '0' || decimals !== '00') ? '-' : ''}${whole}.${decimals}`;
}
export function sameMendelExpense(a: Pick<TrayRow, 'date' | 'person' | 'merchant' | 'amount' | 'currency' | 'budget'>, b: typeof a) {
  const amount = amountKey(a.amount);
  return !!amount && amount === amountKey(b.amount) && !!trayDateKey(a.date) && trayDateKey(a.date) === trayDateKey(b.date)
    && (['person', 'merchant', 'budget'] as const).every(key => a[key].trim() === b[key].trim())
    && /^[A-Z]{3}$/.test(a.currency.trim().toUpperCase()) && a.currency.trim().toUpperCase() === b.currency.trim().toUpperCase();
}
