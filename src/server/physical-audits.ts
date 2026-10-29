import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { User } from '@/contracts';
import { auditDataSchema, type AuditData, type AuditPerson } from '@/lib/physical-audits';

export class AuditError extends Error { constructor(public code: string, public status = 409) { super(code); } }
export type AuditDb = { query<T>(sql: string, values?: unknown[]): Promise<T[]> };
export function assertAuditUser(user: User, write = false) {
  if (!user.active || (write && user.role !== 'ADMIN')) throw new AuditError('FORBIDDEN', 403);
}
const uuid = z.string().uuid();
const importRow = z.object({ cuil: z.string().regex(/^\d{11}$/), data: auditDataSchema }).strict();
export const auditActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('import'), rows: z.array(importRow).min(1).max(100) }).strict(),
  z.object({ action: z.literal('save'), id: uuid.nullable(), cuil: z.string().regex(/^\d{11}$/).optional(), version: z.number().int().nonnegative(), requestId: uuid, kind: z.enum(['EDIT', 'AUDIT']), data: auditDataSchema }).strict(),
]);
type PersonRow = { id: string; cuil: string; data: AuditData; version: number };
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function auditOverview(db: AuditDb, user: User): Promise<AuditPerson[]> {
  assertAuditUser(user);
  const rows = await db.query<PersonRow>('SELECT id,cuil,data,version FROM fnet_audit_people ORDER BY data->>\'sector\',data->>\'name\' LIMIT 5001');
  if (rows.length > 5000) throw new AuditError('DATASET_TOO_LARGE', 422);
  return rows.map(r => ({ ...r.data, id: r.id, version: r.version, cuil: user.role === 'ADMIN' ? r.cuil : `•••••••${r.cuil.slice(-4)}` }));
}
export async function auditHistory(db: AuditDb, user: User, id: string) {
  assertAuditUser(user); uuid.parse(id);
  const records = await db.query<{ id: string; version: number; data: AuditData; created_at: string; actor_name: string; kind: string }>(
    'SELECT r.id,r.version,r.data,r.created_at,u.name AS actor_name,r.kind FROM fnet_audit_records r JOIN app_users u ON u.id=r.actor_id WHERE r.person_id=$1::uuid ORDER BY r.version DESC', [id]);
  const files = await db.query<{ id: string; record_id: string; file_name: string; byte_count: number; created_at: string; actor_name: string }>(
    'SELECT f.id,f.record_id,f.file_name,f.byte_count,f.created_at,u.name AS actor_name FROM fnet_audit_files f JOIN fnet_audit_records r ON r.id=f.record_id JOIN app_users u ON u.id=f.actor_id WHERE r.person_id=$1::uuid ORDER BY f.created_at', [id]);
  return records.map(r => ({ ...r, files: files.filter(f => f.record_id === r.id) }));
}
/** All callers must wrap this operation in one transaction. No Sytex tables involved. */
export async function auditWrite(db: AuditDb, user: User, raw: z.infer<typeof auditActionSchema>) {
  assertAuditUser(user, true);
  const input = auditActionSchema.parse(raw);
  if (input.action === 'import') {
    if (new Set(input.rows.map(r => r.cuil)).size !== input.rows.length) throw new AuditError('DUPLICATE_PERSON', 422);
    let inserted = 0, unchanged = 0; const conflicts: string[] = [];
    for (const row of [...input.rows].sort((a, b) => a.cuil.localeCompare(b.cuil))) {
      const id = randomUUID();
      const saved = await db.query('INSERT INTO fnet_audit_people(id,cuil,data) VALUES($1::uuid,$2,$3::jsonb) ON CONFLICT(cuil) DO NOTHING RETURNING id', [id, row.cuil, JSON.stringify(row.data)]);
      if (!saved.length) {
        const [current] = await db.query<PersonRow>('SELECT id,cuil,data,version FROM fnet_audit_people WHERE cuil=$1 FOR SHARE', [row.cuil]);
        // Compare canonical validated values, not JSONB property order.
        if (hash(auditDataSchema.parse(current.data)) === hash(row.data)) unchanged++;
        else conflicts.push(current.id);
        continue;
      }
      await db.query('INSERT INTO fnet_audit_records(id,person_id,version,data,kind,request_id,request_hash,actor_id) VALUES($1::uuid,$2::uuid,1,$3::jsonb,\'IMPORT\',$4::uuid,$5,$6::uuid) RETURNING id', [randomUUID(), id, JSON.stringify(row.data), randomUUID(), hash(row), user.id]);
      inserted++;
    }
    return { inserted, unchanged, conflicts };
  }
  if (input.kind === 'AUDIT' && (input.data.status !== 'Realizada' || !input.data.lastDate)) throw new AuditError('AUDIT_DATE_REQUIRED', 422);
  const fingerprint = hash(input);
  const [previous] = await db.query<{ id: string; person_id: string; version: number; request_hash: string; actor_id: string }>('SELECT id,person_id,version,request_hash,actor_id FROM fnet_audit_records WHERE request_id=$1::uuid', [input.requestId]);
  if (previous) {
    if (previous.request_hash !== fingerprint || previous.actor_id !== user.id) throw new AuditError('REQUEST_KEY_REUSED');
    return { id: previous.person_id, recordId: previous.id, version: previous.version, alreadySaved: true };
  }
  const id = input.id ?? randomUUID();
  let version = 1;
  if (input.id) {
    const [current] = await db.query<PersonRow>('SELECT id,cuil,data,version FROM fnet_audit_people WHERE id=$1::uuid FOR UPDATE', [id]);
    if (!current) throw new AuditError('NOT_FOUND', 404);
    if (current.version !== input.version) throw new AuditError('STALE_VERSION');
    if (input.cuil && input.cuil !== current.cuil) throw new AuditError('IDENTITY_CHANGE_NOT_ALLOWED', 422);
    version = current.version + 1;
    await db.query('UPDATE fnet_audit_people SET data=$2::jsonb,version=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1::uuid RETURNING id', [id, JSON.stringify(input.data), version]);
  } else {
    if (!input.cuil || input.version !== 0) throw new AuditError('INPUT_INVALID', 422);
    await db.query('INSERT INTO fnet_audit_people(id,cuil,data) VALUES($1::uuid,$2,$3::jsonb) RETURNING id', [id, input.cuil, JSON.stringify(input.data)]);
  }
  const recordId = randomUUID();
  await db.query('INSERT INTO fnet_audit_records(id,person_id,version,data,kind,request_id,request_hash,actor_id) VALUES($1::uuid,$2::uuid,$3,$4::jsonb,$5,$6::uuid,$7,$8::uuid) RETURNING id', [recordId, id, version, JSON.stringify(input.data), input.kind, input.requestId, fingerprint, user.id]);
  return { id, recordId, version };
}
