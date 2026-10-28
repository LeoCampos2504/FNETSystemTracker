import { createHash } from 'node:crypto';
import type { User } from "@/contracts";
import type { TrayRow } from "@/lib/mendel-bandeja";
import { sameMendelExpense, type SourceRefreshResult } from '@/lib/mendel-source-refresh';
import type { ZoneAction } from "@/server/mendel-zone-input";
import { RECEIPT_ACTION, receiptDetail, receiptEvents, receiptResource, receiptSourceHash, receiptState, type ReceiptEvent } from './mendel-receipt-control';

export type ZoneDb = { query<T>(sql: string, values?: unknown[]): Promise<T[]> };
export class ZoneError extends Error { constructor(public code: string, public status = 409) { super(code); } }
function fail(code: string, status = 409): never { throw new ZoneError(code, status); }
export function assertZoneRole(user: User) { if (!user.active || !["ADMIN", "COORDINATOR"].includes(user.role)) fail("FORBIDDEN", 403); }
async function assertAdmin(user: User) { assertZoneRole(user); if (user.role !== "ADMIN") fail("FORBIDDEN", 403); }
async function assertZone(db: ZoneDb, user: User, zone: string) {
  assertZoneRole(user); if (user.role === "ADMIN") return;
  const allowed = await db.query(`SELECT a.user_id FROM fnet_mendel_zone_access a
    WHERE a.user_id=$1::uuid AND a.zone=$2 AND a.enabled
    AND NOT EXISTS (SELECT 1 FROM ops_ctic_users c WHERE c.user_id=a.user_id) FOR SHARE OF a`, [user.id, zone]);
  if (!allowed.length) fail("FORBIDDEN", 403);
}
type Expense = { transaction_id: string; zone: string; payload: Omit<TrayRow, "key">; revision: number };
function sourceSnapshotHash(row: Expense) {
  return createHash('sha256').update(JSON.stringify([row.zone, row.revision, Object.entries(row.payload).sort(([a], [b]) => a.localeCompare(b))])).digest('hex');
}
async function expenseForActor(db: ZoneDb, user: User, id: string, lock = false): Promise<Expense> {
  const [row] = await db.query<Expense>(`SELECT transaction_id,zone,payload,revision FROM fnet_mendel_zone_expenses WHERE transaction_id=$1${lock ? " FOR UPDATE" : " FOR SHARE"}`, [id]);
  if (!row) fail("NOT_FOUND", 404); await assertZone(db, user, row.zone); return row;
}
export async function zoneOverview(db: ZoneDb, user: User) {
  assertZoneRole(user);
  const rows = await db.query<Expense & { updated_at: Date; decision: string | null; comment: string | null; actor_name: string | null; decision_at: Date | null; decision_id: string | null; decision_revision: number | null }>(`
    SELECT e.transaction_id,e.zone,e.payload,e.revision,e.updated_at,d.decision,d.comment,d.expense_revision AS decision_revision,
      d.id::text AS decision_id,d.created_at AS decision_at,u.name AS actor_name
    FROM fnet_mendel_zone_expenses e
    LEFT JOIN LATERAL (SELECT * FROM fnet_mendel_zone_decisions WHERE transaction_id=e.transaction_id ORDER BY id DESC LIMIT 1) d ON TRUE
    LEFT JOIN app_users u ON u.id=d.actor_id
    WHERE $2::boolean OR (EXISTS (SELECT 1 FROM fnet_mendel_zone_access a WHERE a.zone=e.zone AND a.user_id=$1::uuid AND a.enabled)
      AND NOT EXISTS (SELECT 1 FROM ops_ctic_users c WHERE c.user_id=$1::uuid))
    ORDER BY e.updated_at DESC,e.transaction_id LIMIT 5001`, [user.id, user.role === "ADMIN"]);
  if (rows.length > 5000) fail("DATASET_TOO_LARGE", 422);
  const receiptReviews = new Map((await receiptEvents(db, rows.map(r => r.transaction_id))).map(e => [e.resource_key, e]));
  const result = rows.map(r => ({ ...r.payload, key: r.transaction_id, transactionId: r.transaction_id, zone: r.zone,
    receiptCheck: receiptState(r.payload, receiptReviews.get(receiptResource(r.transaction_id))),
    snapshotHash: sourceSnapshotHash(r), sourceUpdatedAt: new Date(r.updated_at).toISOString(),
    revision: r.revision, decisionId: r.decision_id, internalDecision: r.decision_revision === r.revision ? r.decision ?? "PENDIENTE" : "PENDIENTE",
    needsReconfirmation: r.decision_revision !== null && r.decision_revision !== r.revision,
    decisionComment: r.comment ?? "", decisionActor: r.actor_name ?? "", decisionAt: r.decision_at,
  }));
  const users = user.role === "ADMIN" ? await db.query<{ id: string; name: string }>(`SELECT id::text,name FROM app_users u WHERE role='COORDINATOR' AND active
    AND NOT EXISTS (SELECT 1 FROM ops_ctic_users c WHERE c.user_id=u.id) ORDER BY name`) : [];
  const grants = user.role === "ADMIN" ? await db.query(`SELECT user_id::text,zone,enabled FROM fnet_mendel_zone_access ORDER BY zone,user_id`) : [];
  return { rows: result, users, grants, admin: user.role === "ADMIN", notesAvailable: true, source: "FNET_SHARED_CONTROL" };
}
export async function zoneHistory(db: ZoneDb, user: User, id: string) {
  await expenseForActor(db, user, id);
  return db.query(`SELECT d.id::text,d.decision,d.comment,d.expense_revision,u.name AS actor_name,d.created_at
    FROM fnet_mendel_zone_decisions d JOIN app_users u ON u.id=d.actor_id WHERE d.transaction_id=$1 ORDER BY d.id DESC`, [id]);
}
/** Call only inside one database transaction: permission check + lock + history append are atomic. */
export async function zoneWrite(db: ZoneDb, user: User, input: ZoneAction) {
  assertZoneRole(user);
  if (input.action === 'receipt') {
    await assertAdmin(user); // Document corrections are not coordination approval decisions.
    const row = await expenseForActor(db, user, input.transactionId, true);
    const [previous] = await db.query<ReceiptEvent>('SELECT id::text,actor_id::text,resource_key,action,detail FROM ops_events WHERE id=$1::uuid', [input.requestId]);
    if (previous) {
      const saved = receiptDetail.safeParse(previous.detail);
      if (previous.action !== RECEIPT_ACTION || previous.resource_key !== receiptResource(input.transactionId) || previous.actor_id !== user.id || !saved.success || saved.data.ok !== input.ok || saved.data.expectedEventId !== input.expectedEventId || saved.data.expectedSnapshotHash !== input.expectedSnapshotHash) fail('REQUEST_KEY_REUSED');
      return { saved: true, alreadySaved: true };
    }
    const [latest] = await receiptEvents(db, [input.transactionId]);
    if ((latest?.id ?? null) !== input.expectedEventId) fail('RECEIPT_CHANGED');
    if (sourceSnapshotHash(row) !== input.expectedSnapshotHash) fail('EXPENSE_CHANGED');
    const current = receiptState(row.payload, latest);
    const detail = { ok: input.ok, manual: true as const, before: latest ? current.ok : null, version: current.version + 1,
      sourceHash: receiptSourceHash(row.payload), expectedEventId: input.expectedEventId, expectedSnapshotHash: input.expectedSnapshotHash };
    await db.query('INSERT INTO ops_events(id,resource_key,action,actor_id,detail) VALUES($1::uuid,$2,$3,$4::uuid,$5::jsonb) RETURNING id',
      [input.requestId, receiptResource(input.transactionId), RECEIPT_ACTION, user.id, JSON.stringify(detail)]);
    return { saved: true };
  }
  if (input.action === 'refresh') {
    await assertAdmin(user);
    if (new Set(input.rows.map(r => r.transactionId)).size !== input.rows.length) fail('DUPLICATE_TRANSACTION', 422);
    const result: SourceRefreshResult = { updated: 0, unchanged: 0, issues: [] };
    for (const incoming of [...input.rows].sort((a, b) => a.transactionId.localeCompare(b.transactionId))) {
      const [current] = await db.query<Expense>('SELECT transaction_id,zone,payload,revision FROM fnet_mendel_zone_expenses WHERE transaction_id=$1 FOR UPDATE', [incoming.transactionId]);
      if (!current) { result.issues.push({ transactionId: incoming.transactionId, reason: 'NOT_SHARED' }); continue; }
      if (!sameMendelExpense(current.payload, incoming)) { result.issues.push({ transactionId: incoming.transactionId, reason: 'SOURCE_FACTS_CHANGED' }); continue; }
      const changed = Object.entries(incoming.patch).some(([key, value]) => current.payload[key as keyof typeof incoming.patch] !== value);
      if (!changed) { result.unchanged++; continue; } // Safe idempotent retry after an uncertain network result.
      if (sourceSnapshotHash(current) !== incoming.expectedSnapshotHash) { result.issues.push({ transactionId: incoming.transactionId, reason: 'SOURCE_CHANGED' }); continue; }
      // Evidence-only refresh: never change zone, financial facts, approval revision or decisions/history.
      await db.query(`UPDATE fnet_mendel_zone_expenses SET payload=payload || $2::jsonb,published_by=$3::uuid,updated_at=CURRENT_TIMESTAMP
        WHERE transaction_id=$1 RETURNING transaction_id`, [incoming.transactionId, JSON.stringify(incoming.patch), user.id]);
      result.updated++;
    }
    return result;
  }
  if (input.action === "publish") {
    await assertAdmin(user);
    if (new Set(input.rows.map(r => r.transactionId)).size !== input.rows.length) fail("DUPLICATE_TRANSACTION", 422);
    for (const r of [...input.rows].sort((a, b) => a.transactionId.localeCompare(b.transactionId))) {
      await db.query(`INSERT INTO fnet_mendel_zone_expenses(transaction_id,zone,payload,published_by)
        VALUES($1,$2,$3::jsonb,$4::uuid) ON CONFLICT(transaction_id) DO UPDATE SET zone=EXCLUDED.zone,payload=EXCLUDED.payload,
        revision=fnet_mendel_zone_expenses.revision+1,published_by=EXCLUDED.published_by,updated_at=CURRENT_TIMESTAMP
        WHERE fnet_mendel_zone_expenses.payload IS DISTINCT FROM EXCLUDED.payload OR fnet_mendel_zone_expenses.zone IS DISTINCT FROM EXCLUDED.zone
        RETURNING transaction_id`, [r.transactionId, r.zone, JSON.stringify(r), user.id]);
    }
    return { saved: input.rows.length };
  }
  if (input.action === "access") {
    await assertAdmin(user);
    const candidate = await db.query(`SELECT id FROM app_users u WHERE id=$1::uuid AND role='COORDINATOR' AND active
      AND NOT EXISTS(SELECT 1 FROM ops_ctic_users c WHERE c.user_id=u.id) FOR SHARE OF u`, [input.userId]);
    if (!candidate.length) fail("INVALID_COORDINATOR", 422);
    const zone = await db.query("SELECT transaction_id FROM fnet_mendel_zone_expenses WHERE zone=$1 LIMIT 1", [input.zone]);
    if (!zone.length) fail("UNKNOWN_ZONE", 422);
    await db.query(`INSERT INTO fnet_mendel_zone_access(user_id,zone,enabled,granted_by) VALUES($1::uuid,$2,$3,$4::uuid)
      ON CONFLICT(user_id,zone) DO UPDATE SET enabled=EXCLUDED.enabled,granted_by=EXCLUDED.granted_by,updated_at=CURRENT_TIMESTAMP RETURNING user_id`, [input.userId, input.zone, input.enabled, user.id]);
    return { saved: true };
  }
  const row = await expenseForActor(db, user, input.transactionId, true);
  const [previous] = await db.query<{ transaction_id: string; actor_id: string; expense_revision: number; decision: string; comment: string }>("SELECT transaction_id,actor_id::text,expense_revision,decision,comment FROM fnet_mendel_zone_decisions WHERE request_id=$1::uuid", [input.requestId]);
  if (previous) {
    if (previous.transaction_id !== input.transactionId || previous.actor_id !== user.id || previous.expense_revision !== input.revision || previous.decision !== input.decision || previous.comment !== input.comment) fail("REQUEST_KEY_REUSED");
    return { saved: true, alreadySaved: true };
  }
  if (row.revision !== input.revision) fail("EXPENSE_CHANGED");
  const [latest] = await db.query<{ id: string }>("SELECT id::text FROM fnet_mendel_zone_decisions WHERE transaction_id=$1 ORDER BY id DESC LIMIT 1", [input.transactionId]);
  if ((latest?.id ?? null) !== input.expectedDecisionId) fail("DECISION_CHANGED");
  await db.query(`INSERT INTO fnet_mendel_zone_decisions(request_id,transaction_id,expense_revision,decision,comment,actor_id)
    VALUES($1::uuid,$2,$3,$4,$5,$6::uuid) RETURNING id`, [input.requestId, input.transactionId, input.revision, input.decision, input.comment, user.id]);
  return { saved: true };
}
