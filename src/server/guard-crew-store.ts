import { createHash, randomUUID } from 'node:crypto';
import type { GuardCrew } from '@/contracts/guard-crew';
import { buildGuardSegments } from '@/lib/guard-duty-rules';
import { guardStart, normalizeName } from '@/lib/guard-domain';
import { operationalDateKey, operationalDateTimeToEpoch, operationalDateTimeToInput, operationalDateTimeToUtc } from '@/lib/operational-timezone';
import { SupplyError } from '@/server/services/supply-control';

/** All statements are constant SQL with bound parameters. Mutations MUST run inside one transaction. */
export type CrewDb = { query<T>(sql: string, values?: unknown[]): Promise<T[]> };
export type CrewAccess = { actorId: string; admin: boolean; ctic: boolean; zones: string[]; technicians: string[] };
export type CrewCreate = { requestKey: string; zone: string; technicians: string[]; startAt: string; endAt: string; legacyIds: string[] };
export type CrewReplace = { requestKey: string; id: string; version: number; outgoing: string; incoming: string; effectiveAt: string; reason: string };
type Header = { id: string; zone: string; start_at: Date; end_at: Date; initial_technicians: string[]; legacy_ids: string[]; version: number; cancelled: boolean; request_key: string; request_hash: string; created_by: string };
type Change = { id: string; guard_id: string; effective_at: Date; before_technicians: string[]; after_technicians: string[]; actor_id: string; recorded_at: Date; reason: string; request_key: string; request_hash: string };
const fail = (code: string, status = 409): never => { throw new SupplyError(code, status); };
const iso = (value: Date) => new Date(value).toISOString();
const hash = (actorId: string, input: unknown) => createHash('sha256').update(JSON.stringify({ actorId, input })).digest('hex');
const canRead = (access: CrewAccess, zone: string) => access.admin || access.ctic || access.zones.includes(zone);
export const canWriteCrews = (access: CrewAccess) => !access.ctic && (access.admin || access.zones.length > 0);
function authorize(access: CrewAccess, zone: string) { if (!canWriteCrews(access) || !canRead(access, zone)) fail('FORBIDDEN_PROJECT', 403); }
function known(access: CrewAccess, name: string) {
  const matches = [...new Set(access.technicians.filter(t => normalizeName(t) === normalizeName(name)))];
  if (matches.length !== 1) fail('GUARD_TECHNICIAN_UNKNOWN', 422);
  return matches[0];
}
function pair(access: CrewAccess, names: string[]) {
  if (names.length !== 2 || normalizeName(names[0]) === normalizeName(names[1])) fail('DUPLICATE_TECHNICIANS', 422);
  return names.map(name => known(access, name));
}
/** Validates civil values by roundtrip too: JS must not normalize February 31 to March. */
export function guardInstant(value: string) {
  try {
    const input = operationalDateTimeToInput(value);
    if (!Number.isFinite(operationalDateTimeToEpoch(value)) || (!/(Z|[+-]\d\d:\d\d)$/i.test(value) && input !== value)) fail('GUARD_PERIOD_INVALID', 422);
    return operationalDateTimeToUtc(value);
  } catch { return fail('GUARD_PERIOD_INVALID', 422); }
}
export async function crewStorageReady(db: CrewDb) {
  const [row] = await db.query<{ ready: boolean }>("SELECT to_regclass('public.ops_guard_crews') IS NOT NULL AND to_regclass('public.ops_guard_crew_changes') IS NOT NULL AS ready");
  return row?.ready === true;
}
export async function readCrews(db: CrewDb, access: CrewAccess, from: string, to: string): Promise<GuardCrew[]> {
  const headers = await db.query<Header>('SELECT * FROM ops_guard_crews WHERE start_at < $2::timestamptz AND end_at > $1::timestamptz ORDER BY start_at,zone', [from, to]);
  const visible = headers.filter(h => canRead(access, h.zone));
  if (!visible.length) return [];
  const changes = await db.query<Change>('SELECT * FROM ops_guard_crew_changes WHERE guard_id IN (SELECT jsonb_array_elements_text($1::jsonb)::uuid) ORDER BY effective_at', [JSON.stringify(visible.map(h => h.id))]);
  return visible.map(h => {
    const events = changes.filter(c => c.guard_id === h.id);
    const { segments } = buildGuardSegments(h.id, iso(h.start_at), iso(h.end_at), h.initial_technicians, events.map(c => ({ at: iso(c.effective_at), technicianIds: c.after_technicians, actorUserId: c.actor_id, reason: c.reason })));
    return { id: h.id, zone: h.zone, startAt: iso(h.start_at), endAt: iso(h.end_at), initialTechnicians: h.initial_technicians, version: h.version, cancelled: h.cancelled, legacyIds: h.legacy_ids, segments: segments.map(s => ({ startAt: s.startAt, endAt: s.endAt, technicians: s.technicianIds })), changes: events.map(c => ({ id: c.id, effectiveAt: iso(c.effective_at), before: c.before_technicians, after: c.after_technicians, actorId: c.actor_id, recordedAt: iso(c.recorded_at), reason: c.reason })) };
  });
}
const lock = (db: CrewDb) => db.query('SELECT 1 FROM (SELECT pg_advisory_xact_lock(680250134141)) AS guard_lock');
async function event(db: CrewDb, access: CrewAccess, id: string, action: string, detail: unknown) {
  await db.query('INSERT INTO ops_events(id,resource_key,action,actor_id,detail) VALUES ($1::uuid,$2,$3,$4::uuid,$5::jsonb) RETURNING id', [randomUUID(), id, action, access.actorId, JSON.stringify(detail)]);
}
async function assertNoConflict(db: CrewDb, candidate: GuardCrew) {
  // Global lock serializes all crew writes, including cross-zone technician loans.
  const allAccess: CrewAccess = { actorId: '', admin: true, ctic: false, zones: [], technicians: [] };
  const others = await readCrews(db, allAccess, candidate.startAt, candidate.endAt);
  for (const other of others.filter(o => o.id !== candidate.id && !o.cancelled)) {
    for (const a of candidate.segments) for (const b of other.segments) {
      if (Date.parse(a.startAt) < Date.parse(b.endAt) && Date.parse(b.startAt) < Date.parse(a.endAt) &&
        (candidate.zone === other.zone || a.technicians.some(t => b.technicians.some(u => normalizeName(t) === normalizeName(u))))) fail('GUARD_OVERLAP');
    }
  }
  const legacy = await db.query<{ id: string; technician: string; date_from: Date; date_to: Date }>(
    'SELECT id,technician,date_from,date_to FROM ops_guard_periods UNION ALL SELECT id,technician,week_start,week_start+7 FROM ops_guard_weeks');
  const claimed = await db.query<{ legacy_ids: string[] }>('SELECT legacy_ids FROM ops_guard_crews');
  const linked = new Set([...claimed.flatMap(c => c.legacy_ids), ...candidate.legacyIds]);
  for (const old of legacy.filter(p => !linked.has(p.id))) {
    const start = operationalDateTimeToEpoch(guardStart(iso(old.date_from).slice(0, 10)));
    const end = operationalDateTimeToEpoch(guardStart(iso(old.date_to).slice(0, 10)));
    if (candidate.segments.some(s => Date.parse(s.startAt) < end && start < Date.parse(s.endAt) && s.technicians.some(t => normalizeName(t) === normalizeName(old.technician)))) fail('GUARD_LEGACY_OVERLAP');
  }
}
export async function createCrewInTransaction(db: CrewDb, access: CrewAccess, input: CrewCreate) {
  authorize(access, input.zone);
  const technicians = pair(access, input.technicians), startAt = guardInstant(input.startAt), endAt = guardInstant(input.endAt);
  if (!access.zones.includes(input.zone) || Date.parse(endAt) <= Date.parse(startAt) || Date.parse(endAt) - Date.parse(startAt) > 92 * 86400000 || [startAt, endAt].some(t => operationalDateTimeToInput(t).slice(11) !== '08:00')) fail('GUARD_PERIOD_INVALID', 422);
  if (![0, 2].includes(input.legacyIds.length) || new Set(input.legacyIds).size !== input.legacyIds.length) fail('GUARD_LEGACY_INVALID', 422);
  if (input.legacyIds.length && !access.admin) fail('FORBIDDEN', 403); // Legacy rows have no zone: never infer their scope.
  await lock(db);
  const requestHash = hash(access.actorId, input);
  const [existing] = await db.query<Header>('SELECT * FROM ops_guard_crews WHERE request_key=$1::uuid', [input.requestKey]);
  if (existing) { if (existing.request_hash !== requestHash || existing.created_by !== access.actorId) fail('REQUEST_KEY_REUSED'); return { id: existing.id, alreadySaved: true }; }
  if (input.legacyIds.length) {
    const legacy = await db.query<{ id: string; technician: string; date_from: Date; date_to: Date }>('SELECT id,technician,date_from,date_to FROM ops_guard_periods WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)::uuid) UNION ALL SELECT id,technician,week_start,week_start+7 FROM ops_guard_weeks WHERE id IN (SELECT jsonb_array_elements_text($1::jsonb)::uuid)', [JSON.stringify(input.legacyIds)]);
    const claimed = await db.query<{ legacy_ids: string[] }>('SELECT legacy_ids FROM ops_guard_crews');
    if (legacy.length !== 2 || claimed.some(c => c.legacy_ids.some(id => input.legacyIds.includes(id))) || legacy.some(p => !technicians.some(t => normalizeName(t) === normalizeName(p.technician)) || iso(p.date_from).slice(0, 10) !== operationalDateKey(startAt) || iso(p.date_to).slice(0, 10) !== operationalDateKey(endAt)) || new Set(legacy.map(p => normalizeName(p.technician))).size !== 2) fail('GUARD_LEGACY_INVALID', 422);
  }
  const id = randomUUID();
  await assertNoConflict(db, { id, zone: input.zone, startAt, endAt, initialTechnicians: technicians, version: 1, cancelled: false, legacyIds: input.legacyIds, changes: [], segments: [{ startAt, endAt, technicians }] });
  await db.query('INSERT INTO ops_guard_crews(id,zone,start_at,end_at,initial_technicians,legacy_ids,request_key,request_hash,created_by) VALUES ($1::uuid,$2,$3::timestamptz,$4::timestamptz,$5::jsonb,$6::jsonb,$7::uuid,$8,$9::uuid) RETURNING id', [id, input.zone, startAt, endAt, JSON.stringify(technicians), JSON.stringify(input.legacyIds), input.requestKey, requestHash, access.actorId]);
  await event(db, access, id, 'GUARD_CREW_CREATED', { ...input, startAt, endAt, technicians });
  return { id, alreadySaved: false };
}
export async function replaceCrewInTransaction(db: CrewDb, access: CrewAccess, input: CrewReplace) {
  if (!canWriteCrews(access)) fail('FORBIDDEN', 403);
  await lock(db);
  const [header] = await db.query<Header>('SELECT * FROM ops_guard_crews WHERE id=$1::uuid FOR UPDATE', [input.id]);
  if (!header) fail('NOT_FOUND', 404);
  authorize(access, header.zone);
  const requestHash = hash(access.actorId, input);
  const [previous] = await db.query<Change>('SELECT * FROM ops_guard_crew_changes WHERE request_key=$1::uuid', [input.requestKey]);
  if (previous) { if (previous.request_hash !== requestHash || previous.actor_id !== access.actorId) fail('REQUEST_KEY_REUSED'); return { saved: true, alreadySaved: true }; }
  if (header.cancelled || header.version !== input.version) fail('STALE_VERSION');
  const actual = (await readCrews(db, access, iso(header.start_at), iso(header.end_at))).find(c => c.id === header.id)!;
  const effectiveAt = guardInstant(input.effectiveAt), last = actual.segments.at(-1)!;
  if (Date.parse(effectiveAt) <= Date.parse(last.startAt) || Date.parse(effectiveAt) >= Date.parse(last.endAt)) fail('GUARD_CHANGE_ORDER', 422);
  const outgoing = normalizeName(input.outgoing), incoming = known(access, input.incoming);
  if (!last.technicians.some(t => normalizeName(t) === outgoing) || last.technicians.some(t => normalizeName(t) === normalizeName(incoming))) fail('DUPLICATE_TECHNICIANS', 422);
  if (!input.reason.trim() || input.reason.length > 500) fail('REASON_REQUIRED', 422);
  const after = last.technicians.map(t => normalizeName(t) === outgoing ? incoming : t);
  const segments = [...actual.segments.slice(0, -1), { ...last, endAt: effectiveAt }, { startAt: effectiveAt, endAt: last.endAt, technicians: after }];
  await assertNoConflict(db, { ...actual, segments });
  await db.query('INSERT INTO ops_guard_crew_changes(id,guard_id,effective_at,before_technicians,after_technicians,reason,actor_id,request_key,request_hash) VALUES ($1::uuid,$2::uuid,$3::timestamptz,$4::jsonb,$5::jsonb,$6,$7::uuid,$8::uuid,$9) RETURNING id', [randomUUID(), header.id, effectiveAt, JSON.stringify(last.technicians), JSON.stringify(after), input.reason.trim(), access.actorId, input.requestKey, requestHash]);
  await db.query('UPDATE ops_guard_crews SET version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1::uuid RETURNING id', [header.id]);
  await event(db, access, header.id, 'GUARD_CREW_REPLACED', { before: last.technicians, after, effectiveAt, reason: input.reason });
  return { saved: true, alreadySaved: false };
}
