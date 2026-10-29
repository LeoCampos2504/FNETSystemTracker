import type { TrayRow } from './mendel-bandeja';
import { buildMendelSyncPlan, type EvidenceField, type SourceRefreshResult, type SourceRefreshRow } from './mendel-source-refresh';

/** Import the whole file, never only its visible/unsigned/current-page rows. */
export function planMendelImport(rows: TrayRow[], shared: TrayRow[], fields: readonly EvidenceField[]) {
  const plan = buildMendelSyncPlan(rows, shared, rows, fields);
  return { updates: plan.updates, ready: plan.newRows.filter(r => !!r.zone),
    pending: plan.newRows.filter(r => !r.zone) };
}

export async function saveMendelImport(rows: TrayRow[], fields: readonly EvidenceField[], io: {
  read: () => Promise<TrayRow[]>;
  refresh: (rows: SourceRefreshRow[]) => Promise<SourceRefreshResult>;
  insert: (rows: TrayRow[]) => Promise<number>;
}) {
  // Refresh versions immediately before writing. A failed read must never become an empty catalog.
  const plan = planMendelImport(rows, await io.read(), fields);
  const refreshed = await io.refresh(plan.updates);
  // Refresh conflicts on existing rows must not prevent unrelated new expenses from being saved.
  const inserted = plan.ready.length ? await io.insert(plan.ready) : 0;
  const shared = await io.read();
  const ids = new Set(shared.map(r => r.transactionId));
  const missing = plan.ready.filter(r => !ids.has(r.transactionId));
  if (missing.length) throw new Error(`${missing.length} gastos nuevos no aparecen en el control. Conservá el CSV y reintentá.`);
  return { ...refreshed, inserted, shared, pending: plan.pending };
}
