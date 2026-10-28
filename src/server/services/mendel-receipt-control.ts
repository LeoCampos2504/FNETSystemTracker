import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { TrayRow } from '@/lib/mendel-bandeja';
import type { ZoneDb } from './mendel-zone-control';

export const RECEIPT_ACTION = 'MENDEL_RECEIPT_REVIEWED';
export const receiptResource = (id: string) => 'mendel-receipt:' + id;
export const receiptDetail = z.object({
  ok: z.boolean(), version: z.number().int().positive(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedEventId: z.string().uuid().nullable(), expectedSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  before: z.boolean().nullable(),
  manual: z.literal(true).optional(),
}).strict();
export type ReceiptEvent = { id: string; actor_id: string; actor_name: string; resource_key: string; action: string; detail: z.infer<typeof receiptDetail>; created_at: string | Date };
export function receiptSourceHash(row: Omit<TrayRow, 'key'>) {
  // Notes and zone changes do not erase a document review. Changed evidence or financial identity requires review.
  return createHash('sha256').update(JSON.stringify([row.transactionId, row.date, row.person, row.merchant, row.amount, row.currency, row.budget, row.receipt, row.documentName ?? null, row.receiptStatus ?? null])).digest('hex');
}
export async function receiptEvents(db: ZoneDb, ids: string[]) {
  if (!ids.length) return [];
  return db.query<ReceiptEvent>(`SELECT DISTINCT ON(e.resource_key) e.id::text,e.actor_id::text,e.resource_key,e.action,e.detail,e.created_at,u.name AS actor_name
    FROM ops_events e JOIN app_users u ON u.id=e.actor_id
    WHERE e.action=$1 AND e.resource_key IN (SELECT jsonb_array_elements_text($2::jsonb))
    ORDER BY e.resource_key,(e.detail->>'version')::integer DESC,e.id DESC`, [RECEIPT_ACTION, JSON.stringify(ids.map(receiptResource))]);
}
export function receiptState(row: Omit<TrayRow, 'key'>, event?: ReceiptEvent): NonNullable<TrayRow['receiptCheck']> {
  const saved = event ? receiptDetail.parse(event.detail) : null;
  return { ok: saved?.ok ?? false, eventId: event?.id ?? null, version: saved?.version ?? 0,
    actor: event?.actor_name ?? '', at: event ? new Date(event.created_at).toISOString() : null,
    choice: saved && (saved.ok || saved.manual) ? saved.ok : null,
    needsReview: !!saved && (saved.ok || !!saved.manual) && saved.sourceHash !== receiptSourceHash(row) };
}
