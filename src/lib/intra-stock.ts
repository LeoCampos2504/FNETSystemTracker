import type { IntraAllocation, IntraLine, IntraOverview, IntraRecord, IntraState, IntraTarget } from '@/contracts/intra-stock';
import { fold } from './filters';

export const milli = (quantity: number) => Math.round(quantity * 1000);
export const intraFuel = (product: string) => /^(gasoil|gas oil|diesel|nafta)(\s|$)/.test(fold(product));
export const intraScopeParts = (scope: string) => {
  const parts = scope.split(/\s+-\s+/).map(p => p.trim());
  if (parts.length !== 3 || !/^[A-Z0-9]{2,12}$/i.test(parts[1]) || !parts[0] || !parts[2]) throw Error('INTRA_SCOPE_INVALID');
  return { operation: parts[1].toUpperCase(), location: parts[2] };
};
/** A link is evidence only while the source usage is unchanged and remains reviewed. */
export function validAllocation(link: IntraAllocation, targets: IntraTarget[], records: IntraRecord[]) {
  return link.active && records.some(r => r.id === link.lineId && !r.duplicate) && targets.some(t => t.id === link.targetId && t.kind === link.targetKind && t.hash === link.targetHash);
}
export function lineUse(record: IntraRecord, state: Pick<IntraOverview, 'allocations' | 'targets' | 'records'>) {
  const links = state.allocations.filter(a => a.lineId === record.id && a.active);
  const used = links.filter(a => validAllocation(a, state.targets, state.records)).reduce((sum, a) => sum + milli(a.quantity), 0);
  return { used: used / 1000, remaining: (milli(record.quantity) - used) / 1000, invalid: links.some(a => !validAllocation(a, state.targets, state.records)) };
}
export function intraFuelTotals(state: IntraOverview) {
  return [...new Set(state.scopes.map(s => intraScopeParts(s.name).operation))].sort().map(operation => {
    const rows = state.records.filter(r => r.present && r.fuel && r.operation === operation);
    const pending = rows.reduce((s, r) => s + milli(r.quantity), 0);
    const used = rows.reduce((s, r) => s + milli(lineUse(r, state).used), 0);
    const unlinked = state.targets.filter(t => t.kind === 'FUEL' && t.operation === operation).reduce((s, t) => {
      const linked = state.allocations.filter(a => a.targetId === t.id && a.targetKind === t.kind && validAllocation(a, state.targets, state.records)).reduce((n, a) => n + milli(a.quantity), 0);
      return s + Math.max(0, milli(t.quantity) - linked);
    }, 0);
    const imported = state.scopes.some(s => intraScopeParts(s.name).operation === operation);
    return { operation, imported, pending: pending / 1000, used: used / 1000, remaining: (pending - used) / 1000, unlinked: unlinked / 1000 };
  });
}
export const emptyIntraState = (): IntraState => ({ version: 0, scopes: [], records: [], allocations: [] });

/** Imported files are complete snapshots only of the explicitly confirmed localities.
 * Absence is recorded, never converted into a confirmed Intra discharge. */
export function applyIntraSnapshot(state: IntraState, rows: IntraLine[], scopes: string[], at: string): IntraRecord[] {
  const previous = new Map(state.records.map(r => [r.id, r]));
  const incoming = new Set(rows.map(r => r.id));
  const records = state.records.map(r => scopes.includes(r.scope) && r.present && !incoming.has(r.id) ? { ...r, present: false, missingSince: at } : r);
  const merged = new Map(records.map(r => [r.id, r]));
  for (const row of rows) {
    const old = previous.get(row.id);
    merged.set(row.id, { ...row, present: true, firstSeen: old?.firstSeen ?? at, lastSeen: at, missingSince: null });
  }
  return [...merged.values()];
}
export function allocationLimits(state: IntraOverview, row: IntraRecord, target: IntraTarget, quantity: number) {
  if (!row.present || row.duplicate || row.operation !== target.operation || row.fuel !== (target.kind === 'FUEL')) return false;
  if (target.kind === 'MATERIAL' && fold(row.product) !== fold(target.description)) return false;
  if (target.invoice && target.invoice.replace(/\s|-/g, '').toUpperCase() !== row.invoice.replace(/\s|-/g, '').toUpperCase()) return false;
  const used = state.allocations.filter(a => a.targetId === target.id && a.targetKind === target.kind && validAllocation(a, state.targets, state.records)).reduce((s, a) => s + milli(a.quantity), 0);
  return milli(quantity) > 0 && milli(quantity) <= milli(lineUse(row, state).remaining) && used + milli(quantity) <= milli(target.quantity);
}
