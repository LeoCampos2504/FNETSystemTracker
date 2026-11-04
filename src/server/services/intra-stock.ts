import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Material, SiteFuelLoad } from '@/contracts/operations';
import type { IntraHistory, IntraLine, IntraOverview, IntraState, IntraTarget } from '@/contracts/intra-stock';
import { fold, zoneCode } from '@/lib/filters';
import { allocationLimits, applyIntraSnapshot, emptyIntraState, intraScopeParts } from '@/lib/intra-stock';
import { getPrismaClient } from '@/server/prisma';
import { intraHash } from '@/server/intra-stock-import';
import { audit, fail, type OperationsActor } from './operations';

const resource = 'intra:stock-control:v1';
const action = 'INTRA_STOCK_CONTROL';
const version = z.number().int().nonnegative();
export const intraChange = z.discriminatedUnion('action', [
  z.object({ action: z.literal('link'), version, lineId: z.string().max(100), targetId: z.string().max(2500), targetKind: z.enum(['FUEL', 'MATERIAL']), targetHash: z.string().regex(/^[a-f0-9]{64}$/), quantity: z.number().positive().max(1e9).refine(n => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.00001) }).strict(),
  z.object({ action: z.literal('unlink'), version, id: z.string().uuid() }).strict(),
]);
export const intraImportMeta = z.object({ version, scopes: z.array(z.string().min(1).max(300)).min(1).max(100), complete: z.literal(true) }).strict();
export function assertIntraAdmin(actor: OperationsActor) {
  if (!actor.user.active || actor.user.role !== 'ADMIN' || actor.ctic || actor.allowed !== null) fail('FORBIDDEN', 403);
}
type Reader = Pick<ReturnType<typeof getPrismaClient>, '$queryRaw'>;
type Stored = { state: IntraState; change: string; actorName?: string };
async function current(db: Reader): Promise<IntraState> {
  const [row] = await db.$queryRaw<{ detail: Stored }[]>`SELECT detail FROM ops_events WHERE resource_key=${resource} AND action=${action} ORDER BY (detail->'state'->>'version')::integer DESC,created_at DESC,id DESC LIMIT 1`;
  return row?.detail.state ?? emptyIntraState();
}
export async function intraState(actor: OperationsActor) {
  assertIntraAdmin(actor); return current(getPrismaClient());
}
export async function intraHistory(actor: OperationsActor, before = 2147483647): Promise<IntraHistory[]> {
  assertIntraAdmin(actor);
  const rows = await getPrismaClient().$queryRaw<{ detail: Stored; created_at: Date; name: string }[]>`SELECT e.detail,e.created_at,u.name FROM ops_events e JOIN app_users u ON u.id=e.actor_id WHERE e.resource_key=${resource} AND e.action=${action} AND (e.detail->'state'->>'version')::integer < ${before} ORDER BY (e.detail->'state'->>'version')::integer DESC LIMIT 100`;
  return rows.map(r => ({ version: r.detail.state.version, at: r.created_at.toISOString(), actor: r.detail.actorName ?? r.name, change: r.detail.change }));
}

/** Fuel is represented only by reviewed loads, never again by a generic material line. */
export function intraTargets(fuel: SiteFuelLoad[], materials: Material[]): IntraTarget[] {
  const loads: IntraTarget[] = fuel.filter(r => r.review?.ok && r.liters !== null && Number.isFinite(r.liters) && r.liters > 0 && r.liters <= 1e9).map(r => ({
    id: r.id, kind: 'FUEL', hash: intraHash([r.review!.sourceHash, r.review!.version]), operation: zoneCode(r.project),
    description: r.fuel || 'Combustible', quantity: r.liters!, date: r.date ?? '', formCode: r.formCode, siteCode: r.siteCode,
  }));
  const supplies: IntraTarget[] = materials.flatMap(r => {
    if (r.changed || r.missing || /^(?:gasoil|gas oil|diesel|nafta|combustible|carga de combustible)(?:\s|$)/.test(fold(r.description))) return [];
    const quantity = r.review?.countedQuantity ?? r.quantity;
    if (!quantity || !/^\d+(?:\.\d{1,3})?$/.test(quantity) || !(Number(quantity) > 0) || Number(quantity) > 1e9 || r.review?.intraStatus === 'NO_CORRESPONDE') return [];
    const operations = [...new Set((r.review?.project ? [r.review.project] : r.projects).map(zoneCode))];
    if (operations.length !== 1 || !operations[0]) return [];
    return [{ id: r.key, kind: 'MATERIAL' as const, hash: intraHash([r.hash, r.review?.version ?? 0, quantity]), operation: operations[0], description: r.description, quantity: Number(quantity), date: r.editedAt ?? '', formCode: r.formulario, siteCode: r.siteCode, invoice: r.review?.invoiceNumber || undefined }];
  });
  return [...loads, ...supplies];
}

async function writeState(actor: OperationsActor, expected: number, mutate: (state: IntraState) => Promise<{ state: IntraState; change: string; unchanged?: boolean }>) {
  assertIntraAdmin(actor);
  return getPrismaClient().$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${resource}))) AS lock`;
    const old = await current(tx);
    if (old.version !== expected) fail('STALE_VERSION');
    const result = await mutate(old);
    if (result.unchanged) return { saved: true, unchanged: true, version: old.version };
    result.state.version = old.version + 1;
    if (result.state.records.length > 10000 || result.state.allocations.length > 10000 || Buffer.byteLength(JSON.stringify(result.state)) > 4 * 1024 * 1024) fail('INTRA_HISTORY_LIMIT', 422);
    await audit(tx, actor, resource, action, { state: result.state, change: result.change, actorName: actor.user.name });
    return { saved: true, unchanged: false, version: result.state.version };
  });
}
export async function saveIntraSnapshot(actor: OperationsActor, rows: IntraLine[], meta: z.infer<typeof intraImportMeta>, fileName: string) {
  assertIntraAdmin(actor);
  const input = intraImportMeta.parse(meta);
  if (new Set(input.scopes).size !== input.scopes.length || rows.some(r => !input.scopes.includes(r.scope))) fail('INTRA_SCOPE_INVALID', 422);
  return writeState(actor, input.version, async old => {
    if (input.scopes.some(scope => { try { intraScopeParts(scope); } catch { return true; } return !rows.some(r => r.scope === scope) && !old.scopes.some(s => s.name === scope); })) fail('INTRA_SCOPE_INVALID', 422);
    const at = new Date().toISOString();
    const scopes = input.scopes.map(name => {
      const localRows = rows.filter(r => r.scope === name).sort((a, b) => a.id.localeCompare(b.id));
      return { name, importedAt: at, importedBy: actor.user.name, fileName: fileName.replace(/[^\p{L}\p{N} _().-]/gu, '_').slice(0, 150), fingerprint: intraHash(localRows) };
    });
    if (scopes.every(s => old.scopes.some(p => p.name === s.name && p.fingerprint === s.fingerprint))) return { state: old, change: '', unchanged: true };
    return {
      state: { ...old, scopes: [...old.scopes.filter(s => !input.scopes.includes(s.name)), ...scopes], records: applyIntraSnapshot(old, rows, input.scopes, at) },
      change: `Excel importado: ${rows.length} renglones · ${input.scopes.join(', ')}`,
    };
  });
}
export async function changeIntraLink(actor: OperationsActor, raw: z.infer<typeof intraChange>, load: () => Promise<IntraTarget[]>) {
  assertIntraAdmin(actor);
  const input = intraChange.parse(raw);
  // Like fuel-review, load source evidence before locking the local ledger. These
  // broad reads use the shared client, not the transaction's snapshot, and must not
  // spend its timeout or hold every other importer behind a slow source read.
  const targets = input.action === 'link' ? await load() : [];
  return writeState(actor, input.version, async state => {
    if (input.action === 'unlink') {
      const previous = state.allocations.find(a => a.id === input.id && a.active);
      if (!previous) fail('INTRA_LINK_NOT_FOUND', 404);
      return { state: { ...state, allocations: state.allocations.map(a => a.id === input.id ? { ...a, active: false, removedAt: new Date().toISOString(), removedBy: actor.user.name } : a) }, change: `Vínculo retirado: ${previous.formCode} · ${previous.quantity}` };
    }
    const target = targets.find(t => t.id === input.targetId && t.kind === input.targetKind && t.hash === input.targetHash);
    const row = state.records.find(r => r.id === input.lineId);
    if (!row || !target) fail('INTRA_SOURCE_CHANGED');
    const overview: IntraOverview = { ...state, targets };
    if (!allocationLimits(overview, row, target, input.quantity)) fail('INTRA_ALLOCATION_INVALID', 422);
    return {
      state: { ...state, allocations: [...state.allocations, { id: randomUUID(), lineId: row.id, targetId: target.id, targetKind: target.kind, targetHash: target.hash, quantity: input.quantity, description: target.description, formCode: target.formCode, createdAt: new Date().toISOString(), createdBy: actor.user.name, active: true }] },
      change: `Uso vinculado: ${target.formCode} → ${row.invoice} · ${input.quantity}${row.fuel ? ' L' : ''}`,
    };
  });
}
