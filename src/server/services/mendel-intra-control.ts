import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { User } from '@/contracts';
import type { MendelIntraHistoryEntry, MendelIntraState } from '@/lib/mendel-intra';
import type { MendelIntraInput } from '@/server/mendel-intra-input';

export type IntraDb = { query<T>(sql: string, values?: unknown[]): Promise<T[]> };
export type IntraPurchase = { transactionId: string; transactionDate: string | Date; userName: string | null; merchant: string | null; totalAmount: { toString(): string } | string | number; currency: string; budget: string | null };
export class MendelIntraError extends Error { constructor(public code: string, public status = 409) { super(code); } }
const fail = (code: string, status = 409): never => { throw new MendelIntraError(code, status); };
const ACTION = 'MENDEL_INTRA_MANUAL_CONFIRMED';
const resource = (id: string) => 'mendel-intra:' + id;
const flags = z.object({ uploaded: z.boolean().nullable(), downloaded: z.boolean().nullable() }).strict();
const details = flags.extend({ version: z.number().int().positive(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), expectedEventId: z.string().uuid().nullable(), before: flags }).strict();
type Saved = z.infer<typeof details>;
type Event = { id: string; resource_key: string; action: string; actor_id: string; actor_name: string | null; created_at: Date; detail: unknown };
function assertAdmin(user: User) { if (!user.active || user.role !== 'ADMIN') fail('FORBIDDEN', 403); }
const parsed = (row: Event): Saved => { const value = details.safeParse(row.detail); return value.success ? value.data : fail('INTRA_RECORD_INVALID', 503); };
/** Decimal canonicalization is string-based; never round a money value through JS Number. */
const decimal = (amount: IntraPurchase['totalAmount']) => String(amount).replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');
export function intraSourceHash(purchase: IntraPurchase) {
  return createHash('sha256').update(JSON.stringify([purchase.transactionId, new Date(purchase.transactionDate).toISOString(), purchase.userName, purchase.merchant, decimal(purchase.totalAmount), purchase.currency, purchase.budget])).digest('hex');
}
function state(purchase: IntraPurchase, event?: Event): MendelIntraState {
  const sourceHash = intraSourceHash(purchase), saved = event ? parsed(event) : null;
  return { uploaded: saved?.uploaded ?? null, downloaded: saved?.downloaded ?? null, eventId: event?.id ?? null, version: saved?.version ?? 0, updatedAt: event ? new Date(event.created_at).toISOString() : null, updatedBy: event?.actor_name ?? null, sourceHash, needsReview: !!saved && saved.sourceHash !== sourceHash };
}
async function latest(db: IntraDb, ids: string[]) {
  if (!ids.length) return [];
  // Version is monotonic under a purchase-row lock, even when transaction timestamps coincide.
  return db.query<Event>(`SELECT DISTINCT ON (e.resource_key) e.id::text,e.resource_key,e.action,e.actor_id::text,e.detail,e.created_at,u.name AS actor_name
    FROM ops_events e JOIN app_users u ON u.id=e.actor_id
    WHERE e.action=$1 AND e.resource_key IN (SELECT jsonb_array_elements_text($2::jsonb))
    ORDER BY e.resource_key,(e.detail->>'version')::integer DESC,e.created_at DESC,e.id DESC`, [ACTION, JSON.stringify(ids.map(resource))]);
}
export async function purchaseIntraStates(db: IntraDb, user: User, purchases: IntraPurchase[]) {
  assertAdmin(user);
  const events = await latest(db, purchases.map(p => p.transactionId)), byKey = new Map(events.map(e => [e.resource_key, e]));
  return new Map(purchases.map(p => [p.transactionId, state(p, byKey.get(resource(p.transactionId)))]));
}
async function purchase(db: IntraDb, id: string, lock: boolean) {
  const [row] = await db.query<IntraPurchase>(`SELECT transaction_id AS "transactionId",transaction_date AS "transactionDate",user_name AS "userName",merchant,total_amount::text AS "totalAmount",currency,budget
    FROM mendel_transactions WHERE transaction_id=$1${lock ? ' FOR UPDATE' : ' FOR SHARE'}`, [id]);
  if (!row) fail('NOT_FOUND', 404);
  return row;
}
export async function intraOverview(db: IntraDb, user: User, transactionId: string) {
  assertAdmin(user);
  const row = await purchase(db, transactionId, false), states = await purchaseIntraStates(db, user, [row]);
  const events = await db.query<Event>(`SELECT e.id::text,e.resource_key,e.action,e.actor_id::text,e.detail,e.created_at,u.name AS actor_name FROM ops_events e JOIN app_users u ON u.id=e.actor_id
    WHERE e.action=$1 AND e.resource_key=$2 ORDER BY (e.detail->>'version')::integer DESC,e.created_at DESC,e.id DESC LIMIT 100`, [ACTION, resource(transactionId)]);
  const history: MendelIntraHistoryEntry[] = events.map(e => { const s = parsed(e); return { id:e.id, uploaded:s.uploaded, downloaded:s.downloaded, before:s.before, version:s.version, recordedAt:new Date(e.created_at).toISOString(), actor:e.actor_name ?? 'Cuenta registrada' }; });
  return { state: states.get(transactionId)!, history };
}
/** One Prisma transaction must contain purchase lock, optimistic checks and append-only confirmation. */
export async function confirmIntra(db: IntraDb, user: User, input: MendelIntraInput) {
  assertAdmin(user);
  const row = await purchase(db, input.transactionId, true);
  const [retry] = await db.query<Event>('SELECT id::text,resource_key,action,actor_id::text,detail,created_at FROM ops_events WHERE id=$1::uuid', [input.requestId]);
  const [last] = await latest(db, [input.transactionId]), current = state(row, last);
  if (retry) {
    if (retry.action !== ACTION || retry.resource_key !== resource(input.transactionId) || retry.actor_id !== user.id) fail('REQUEST_KEY_REUSED');
    const previous = parsed(retry);
    if (previous.uploaded !== input.uploaded || previous.downloaded !== input.downloaded || previous.sourceHash !== input.sourceHash || previous.expectedEventId !== input.expectedEventId) fail('REQUEST_KEY_REUSED');
    return { state: current, alreadySaved: true };
  }
  if (current.eventId !== input.expectedEventId) fail('INTRA_STATE_CHANGED');
  if (current.sourceHash !== input.sourceHash) fail('MENDEL_PURCHASE_CHANGED');
  if (current.uploaded === input.uploaded && current.downloaded === input.downloaded && !current.needsReview) return { state:current, unchanged:true };
  const detail: Saved = { uploaded:input.uploaded, downloaded:input.downloaded, version:current.version+1, sourceHash:current.sourceHash, expectedEventId:input.expectedEventId, before:{ uploaded:current.uploaded, downloaded:current.downloaded } };
  await db.query('INSERT INTO ops_events(id,resource_key,action,actor_id,detail) VALUES($1::uuid,$2,$3,$4::uuid,$5::jsonb) RETURNING id', [input.requestId, resource(input.transactionId), ACTION, user.id, JSON.stringify(detail)]);
  const [saved] = await latest(db, [input.transactionId]);
  return { state:state(row,saved), alreadySaved:false };
}
