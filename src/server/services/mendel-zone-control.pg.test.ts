import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { User } from "@/contracts";
import { sharedExpenseSchema, zoneActionSchema, type ZoneAction } from "@/server/mendel-zone-input";
import { zoneHistory, zoneOverview, zoneWrite, type ZoneDb } from "./mendel-zone-control";

const admin = { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN", active: true, name: "Admin de prueba" } as User;
const coord = { ...admin, id: "00000000-0000-4000-8000-000000000002", role: "COORDINATOR" } as User;
const other = { ...coord, id: "00000000-0000-4000-8000-000000000003" };
const row = { transactionId: "EXAMPLE-001", zone: "NOA", date: "2026-10-10", person: "Persona ficticia", merchant: "Comercio de prueba", amount: "25000", currency: "ARS", budget: "VIATICOS", notes: "Nota sintética", approvalNotes: "", receipt: "NO" as const, locality: "Localidad ficticia", coordinator: "", paymentStatus: "Confirmada", officialApproval: "", zoneSource: "Planilla de prueba" };
let pg: PGlite, db: ZoneDb;
async function write(user: User, input: ZoneAction) { return pg.transaction(async tx => zoneWrite({ query: async <T>(sql: string, params: unknown[] = []) => (await tx.query<T>(sql, params)).rows }, user, input)); }
const decision = (overrides: object = {}) => ({ action: "decide", transactionId: row.transactionId, revision: 1, expectedDecisionId: null, requestId: crypto.randomUUID(), decision: "AUTORIZADO", comment: "Revisado personalmente", ...overrides }) as Extract<ZoneAction, { action: "decide" }>;
beforeEach(async () => {
  pg = new PGlite(); db = { query: async <T>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows };
  await pg.exec("CREATE TABLE app_users(id UUID PRIMARY KEY,name TEXT,role TEXT,active BOOLEAN); CREATE TABLE ops_ctic_users(user_id UUID PRIMARY KEY);");
  const ops = readFileSync(new URL('../../../prisma/migrations/20261005_add_coordinator_operations/migration.sql', import.meta.url), 'utf8');
  await pg.exec(ops.match(/CREATE TABLE "ops_events" \([\s\S]*?\n\);/)![0]);
  for (const u of [admin, coord, other]) await pg.query("INSERT INTO app_users VALUES($1,$2,$3,true)", [u.id, u.name, u.role]);
  await pg.exec(readFileSync(new URL("../../../prisma/migrations/20261016_add_mendel_zone_control/migration.sql", import.meta.url), "utf8"));
});
afterEach(async () => { await pg.close(); });
async function publishAndGrant() { await write(admin, { action: "publish", rows: [row] }); await write(admin, { action: "access", userId: coord.id, zone: row.zone, enabled: true }); }
async function refreshInput(patch: object = {notes:'Nota corregida',documentName:'example.pdf',receiptStatus:'FINALIZADA'}) {
  const current=(await zoneOverview(db,admin)).rows.find(r=>r.transactionId===row.transactionId)!;
  return zoneActionSchema.parse({action:'refresh',rows:[{transactionId:row.transactionId,date:row.date,person:row.person,merchant:row.merchant,amount:row.amount,currency:row.currency,budget:row.budget,expectedSnapshotHash:current.snapshotHash,patch}]});
}

async function receiptInput(ok = true) {
  const current = (await zoneOverview(db, admin)).rows[0];
  return zoneActionSchema.parse({ action: 'receipt', transactionId: current.transactionId, ok, expectedEventId: current.receiptCheck.eventId,
    expectedSnapshotHash: current.snapshotHash, requestId: crypto.randomUUID() });
}

describe('manual document review, persisted separately from source and approvals', () => {
  it('shares OK across accounts, records actor/date, preserves CSV and approval history, and supports undo', async () => {
    await publishAndGrant(); await write(coord, decision());
    await write(admin, await receiptInput());
    const current = (await zoneOverview(db, coord)).rows[0];
    expect(current.receipt).toBe('NO');
    expect(current.receiptCheck).toMatchObject({ ok: true, actor: admin.name, version: 1, needsReview: false });
    expect(current.receiptCheck.at).toBeTruthy(); expect(current.internalDecision).toBe('AUTORIZADO');
    expect(await zoneHistory(db, coord, row.transactionId)).toHaveLength(1);
    await write(admin, await receiptInput(false));
    expect((await zoneOverview(db, admin)).rows[0].receiptCheck).toMatchObject({ ok: false, version: 2 });
    const events = await db.query<{ detail: { before: boolean | null; ok: boolean } }>("SELECT detail FROM ops_events WHERE action='MENDEL_RECEIPT_REVIEWED' ORDER BY (detail->>'version')::integer");
    expect(events.map(e => e.detail)).toMatchObject([{ before: null, ok: true }, { before: true, ok: false }]);
  });
  it('does not allow coordinators to self-certify receipts, even within an enabled zone', async () => {
    await publishAndGrant(); const input = await receiptInput();
    await expect(write(coord, input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await db.query('SELECT id FROM ops_events')).toHaveLength(0);
  });
  it('rejects stale manual changes, accepts identical retry, and rejects reused request IDs', async () => {
    await publishAndGrant(); const input = await receiptInput(); await write(admin, input);
    expect(await write(admin, input)).toMatchObject({ alreadySaved: true });
    if (input.action !== 'receipt') throw Error('fixture');
    await expect(write(admin, { ...input, ok: false })).rejects.toMatchObject({ code: 'REQUEST_KEY_REUSED' });
    await expect(write(admin, { ...input, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'RECEIPT_CHANGED' });
    expect(await db.query('SELECT id FROM ops_events')).toHaveLength(1);
  });
  it('preserves manual OK on repeat CSV publication and note refresh, but asks review after changed document evidence', async () => {
    await publishAndGrant(); await write(admin, await receiptInput());
    await write(admin, { action: 'publish', rows: [row] });
    await write(admin, await refreshInput({ notes: 'Nota nueva sintética' }));
    expect((await zoneOverview(db, admin)).rows[0].receiptCheck).toMatchObject({ ok: true, needsReview: false });
    const stale = await receiptInput(false);
    await write(admin, await refreshInput({ documentName: 'new-synthetic.pdf' }));
    expect((await zoneOverview(db, admin)).rows[0].receiptCheck).toMatchObject({ ok: true, needsReview: true });
    await expect(write(admin, stale)).rejects.toMatchObject({ code: 'EXPENSE_CHANGED' });
    await write(admin, await receiptInput());
    expect((await zoneOverview(db, admin)).rows[0].receiptCheck).toMatchObject({ ok: true, needsReview: false, version: 2 });
  });
  it('rolls back receipt evidence if the surrounding transaction fails', async () => {
    await publishAndGrant(); const input = await receiptInput();
    await expect(pg.transaction(async tx => {
      await zoneWrite({ query: async <T>(s: string, p: unknown[] = []) => (await tx.query<T>(s, p)).rows }, admin, input);
      throw Error('synthetic rollback');
    })).rejects.toThrow('synthetic rollback');
    expect(await db.query('SELECT id FROM ops_events')).toHaveLength(0);
  });
  it('does not accept a forged reviewer, date, or document status inside imported source', () => {
    expect(sharedExpenseSchema.safeParse({ ...row, receiptCheck: { ok: true } }).success).toBe(false);
    expect(zoneActionSchema.safeParse({ action: 'receipt', transactionId: row.transactionId, ok: true, expectedEventId: null, expectedSnapshotHash: 'a'.repeat(64), requestId: crypto.randomUUID(), actorId: admin.id }).success).toBe(false);
  });
});
describe('evidence-only CSV refresh on actual SQL',()=>{
  it('preserves approval revision, author, zone, amount and full decision history',async()=>{
    await publishAndGrant();await write(coord,decision());const before=(await zoneOverview(db,admin)).rows[0];
    expect(await write(admin,await refreshInput())).toMatchObject({updated:1,unchanged:0,issues:[]});
    const after=(await zoneOverview(db,admin)).rows[0];
    expect(after).toMatchObject({revision:before.revision,internalDecision:'AUTORIZADO',decisionId:before.decisionId,decisionActor:before.decisionActor,zone:row.zone,amount:row.amount,notes:'Nota corregida',documentName:'example.pdf'});
    expect(after.snapshotHash).not.toBe(before.snapshotHash);expect(after.sourceUpdatedAt).toBeTruthy();expect(await zoneHistory(db,coord,row.transactionId)).toHaveLength(1);
  });
  it('makes retries idempotent and rejects overwriting another refreshed snapshot',async()=>{
    await publishAndGrant();const first=await refreshInput();await write(admin,first);
    expect(await write(admin,first)).toMatchObject({updated:0,unchanged:1});
    if(first.action!=='refresh')throw Error('bad fixture');
    expect(await write(admin,{...first,rows:first.rows.map(r=>({...r,patch:{notes:'Stale'}}))})).toMatchObject({updated:0,issues:[{reason:'SOURCE_CHANGED'}]});
  });
  it('requires Admin, existing exact identity, and never creates a missing row',async()=>{
    await publishAndGrant();const input=await refreshInput();await expect(write(coord,input)).rejects.toMatchObject({code:'FORBIDDEN'});
    if(input.action!=='refresh')throw Error('bad fixture');
    expect(await write(admin,{...input,rows:input.rows.map(r=>({...r,amount:'999'}))})).toMatchObject({updated:0,issues:[{reason:'SOURCE_FACTS_CHANGED'}]});
    expect(await write(admin,{...input,rows:input.rows.map(r=>({...r,transactionId:'MISSING'}))})).toMatchObject({updated:0,issues:[{reason:'NOT_SHARED'}]});
    expect((await zoneOverview(db,admin)).rows).toHaveLength(1);
  });
  it('rejects patches that smuggle zone, amount, approvals or author fields',async()=>{
    await publishAndGrant();const input=await refreshInput();
    if(input.action!=='refresh')throw Error('bad fixture');
    for(const patch of [{zone:'OTHER'},{amount:'0'},{internalDecision:'AUTORIZADO'},{actorId:coord.id},{}])expect(zoneActionSchema.safeParse({...input,rows:[{...input.rows[0],patch}]}).success).toBe(false);
  });
});
describe("persistent Mendel control with real SQL on synthetic data", () => {
  it("fails closed for coordinator without grants, even when no project restrictions exist", async () => { await write(admin, { action: "publish", rows: [row] }); expect((await zoneOverview(db, coord)).rows).toEqual([]); });
  it("grants only the selected real account and zone", async () => { await publishAndGrant(); await write(admin, { action: "publish", rows: [{ ...row, transactionId: "EXAMPLE-002", zone: "BAM" }] }); expect((await zoneOverview(db, coord)).rows.map(r => r.zone)).toEqual(["NOA"]); expect((await zoneOverview(db, other)).rows).toEqual([]); });
  it("rejects decisions and history from another coordinator", async () => { await publishAndGrant(); await expect(write(other, decision())).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(zoneHistory(db, other, row.transactionId)).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  it("does not let a coordinator import expenses or grant access", async () => { await expect(write(coord, { action: "publish", rows: [row] })).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(write(coord, { action: "access", userId: other.id, zone: "NOA", enabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  it("rejects unknown, inactive and CTIC coordinator accounts", async () => { await publishAndGrant(); await pg.query("UPDATE app_users SET active=false WHERE id=$1", [other.id]); await expect(write(admin, { action: "access", userId: other.id, zone: "NOA", enabled: true })).rejects.toMatchObject({ code: "INVALID_COORDINATOR" }); await pg.query("INSERT INTO ops_ctic_users VALUES($1)", [coord.id]); expect((await zoneOverview(db, coord)).rows).toEqual([]); await expect(write(coord, decision())).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  it("records author, date and full change history without changing official payment/approval", async () => { await publishAndGrant(); await write(coord, decision()); let view = await zoneOverview(db, admin); expect(view.rows[0].internalDecision).toBe("AUTORIZADO"); expect(view.rows[0].decisionActor).toBe(coord.name); expect(view.rows[0].officialApproval).toBe(""); expect(view.rows[0].paymentStatus).toBe("Confirmada"); await write(coord, decision({ expectedDecisionId: view.rows[0].decisionId, decision: "NO_AUTORIZADO", comment: "Corregido" })); view = await zoneOverview(db, coord); expect(view.rows[0].internalDecision).toBe("NO_AUTORIZADO"); const h = await zoneHistory(db, coord, row.transactionId) as { decision: string; created_at: Date }[]; expect(h.map(x => x.decision)).toEqual(["NO_AUTORIZADO", "AUTORIZADO"]); expect(h[0].created_at).toBeTruthy(); });
  it("is idempotent for retry but rejects reusing the same request with another decision", async () => { await publishAndGrant(); const d = decision(); await write(coord, d); expect(await write(coord, d)).toMatchObject({ alreadySaved: true }); await expect(write(coord, { ...d, decision: "NO_AUTORIZADO" })).rejects.toMatchObject({ code: "REQUEST_KEY_REUSED" }); expect(await zoneHistory(db, coord, row.transactionId)).toHaveLength(1); });
  it("rejects stale replies instead of overwriting another coordinator silently", async () => { await publishAndGrant(); await write(coord, decision()); await expect(write(coord, decision())).rejects.toMatchObject({ code: "DECISION_CHANGED" }); });
  it("keeps repeat imports stable and requires reconfirmation after an actual expense change", async () => { await publishAndGrant(); await write(coord, decision()); await write(admin, { action: "publish", rows: [row] }); expect((await zoneOverview(db, admin)).rows[0].revision).toBe(1); await write(admin, { action: "publish", rows: [{ ...row, amount: "30000" }] }); const r = (await zoneOverview(db, admin)).rows[0]; expect(r.revision).toBe(2); expect(r.internalDecision).toBe("PENDIENTE"); expect(r.needsReconfirmation).toBe(true); await expect(write(coord, decision({ expectedDecisionId: r.decisionId }))).rejects.toMatchObject({ code: "EXPENSE_CHANGED" }); expect(await zoneHistory(db, coord, row.transactionId)).toHaveLength(1); });
  it("revokes access immediately and never fabricates approvals from notes", async () => { await publishAndGrant(); await write(admin, { action: "publish", rows: [{ ...row, notes: "OK - Persona ficticia 10/10" }] }); expect((await zoneOverview(db, coord)).rows[0].internalDecision).toBe("PENDIENTE"); await write(admin, { action: "access", userId: coord.id, zone: "NOA", enabled: false }); expect((await zoneOverview(db, coord)).rows).toEqual([]); await expect(write(coord, decision())).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  it("rolls back the full batch on any failure", async () => { await expect(pg.transaction(async tx => { await zoneWrite({ query: async <T>(s: string, p: unknown[] = []) => (await tx.query<T>(s, p)).rows }, admin, { action: "publish", rows: [{ ...row, transactionId: "ROLLBACK" }] }); throw Error("rollback"); })).rejects.toThrow("rollback"); expect((await db.query("SELECT transaction_id FROM fnet_mendel_zone_expenses WHERE transaction_id='ROLLBACK'")).length).toBe(0); });
  it("validates dates, IDs, explicit zone and strict input fields", () => { expect(sharedExpenseSchema.safeParse(row).success).toBe(true); for (const invalid of [{ ...row, date: "31/02/2026" }, { ...row, zone: "" }, { ...row, transactionId: "" }, { ...row, actorId: admin.id }]) expect(sharedExpenseSchema.safeParse(invalid).success).toBe(false); expect(zoneActionSchema.safeParse({ ...decision(), actorId: admin.id }).success).toBe(false); });
});
