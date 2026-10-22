import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canWriteCrews, createCrewInTransaction, guardInstant, readCrews, replaceCrewInTransaction, type CrewAccess, type CrewCreate, type CrewDb, type CrewReplace } from './guard-crew-store';

const admin: CrewAccess = { actorId:'00000000-0000-4000-8000-000000000001',admin:true,ctic:false,zones:['NOA','BAM'],technicians:['Técnico A','Técnico B','Técnico C','Técnico D'] };
const coordinator: CrewAccess = {...admin,actorId:'00000000-0000-4000-8000-000000000002',admin:false,zones:['NOA']};
let pg:PGlite, db:CrewDb;
const windowFrom='2026-10-01T11:00:00Z', windowTo='2026-11-01T11:00:00Z';
const input = (changes:Partial<CrewCreate>={}):CrewCreate => ({requestKey:crypto.randomUUID(),zone:'NOA',technicians:['Técnico A','Técnico B'],startAt:'2026-10-14T08:00',endAt:'2026-10-21T08:00',legacyIds:[],...changes});
const create = (data:CrewCreate=input(),access=admin) => pg.transaction(tx=>createCrewInTransaction({query:async<T>(s:string,p:unknown[]=[]) => (await tx.query<T>(s,p)).rows},access,data));
const change = (id:string,version=1,changes:Partial<CrewReplace>={}):CrewReplace => ({id,version,requestKey:crypto.randomUUID(),outgoing:'Técnico B',incoming:'Técnico C',effectiveAt:'2026-10-16T08:00',reason:'Relevo de prueba',...changes});
const replace = (data:CrewReplace,access=admin) => pg.transaction(tx=>replaceCrewInTransaction({query:async<T>(s:string,p:unknown[]=[]) => (await tx.query<T>(s,p)).rows},access,data));
beforeEach(async()=>{
  pg=new PGlite(); db={query:async<T>(s:string,p:unknown[]=[]) => (await pg.query<T>(s,p)).rows};
  await pg.exec('CREATE TABLE app_users(id UUID PRIMARY KEY); CREATE TABLE ops_events(id UUID PRIMARY KEY,resource_key TEXT,action TEXT,actor_id UUID,detail JSONB); CREATE TABLE ops_guard_periods(id UUID PRIMARY KEY,technician TEXT,date_from DATE,date_to DATE); CREATE TABLE ops_guard_weeks(id UUID PRIMARY KEY,technician TEXT,week_start DATE);');
  for(const actor of [admin,coordinator]) await pg.query('INSERT INTO app_users VALUES($1)',[actor.actorId]);
  await pg.exec(readFileSync(new URL('../../prisma/migrations/20261018_add_guard_crews/migration.sql',import.meta.url),'utf8'));
});
afterEach(async()=>{await pg.close();});
describe('persistent guard crews: real SQL on disposable synthetic PostgreSQL-compatible data',()=>{
  it('saves two technicians as one shared crew, 08:00 Argentina as 11:00Z, never an automatic fixed partnership',async()=>{
    await create();
    const [crew]=await readCrews(db,admin,windowFrom,windowTo);
    expect(crew).toMatchObject({zone:'NOA',initialTechnicians:['Técnico A','Técnico B'],startAt:'2026-10-14T11:00:00.000Z',endAt:'2026-10-21T11:00:00.000Z',version:1});
    expect(crew.segments).toHaveLength(1);
    expect(await db.query('SELECT * FROM ops_guard_periods')).toEqual([]);
    await create(input({startAt:'2026-10-21T08:00',endAt:'2026-10-28T08:00',technicians:['Técnico A','Técnico C']}));
    expect(await readCrews(db,admin,windowFrom,windowTo)).toHaveLength(2);
  });
  it('keeps A+B → A+C → C+D immutable with effective time, recorded time, actor, reason and version',async()=>{
    const {id}=await create();
    await replace(change(id));
    await replace(change(id,2,{outgoing:'Técnico A',incoming:'Técnico D',effectiveAt:'2026-10-18T20:00'}));
    const [crew]=await readCrews(db,admin,windowFrom,windowTo);
    expect(crew.segments.map(s=>s.technicians)).toEqual([['Técnico A','Técnico B'],['Técnico A','Técnico C'],['Técnico D','Técnico C']]);
    expect(crew.changes[0]).toMatchObject({before:['Técnico A','Técnico B'],after:['Técnico A','Técnico C'],actorId:admin.actorId,reason:'Relevo de prueba',effectiveAt:'2026-10-16T11:00:00.000Z'});
    expect(crew.changes.every(c=>Number.isFinite(Date.parse(c.recordedAt)))).toBe(true);
    expect(crew.initialTechnicians).toEqual(['Técnico A','Técnico B']); expect(crew.version).toBe(3);
    expect(await db.query('SELECT * FROM ops_events')).toHaveLength(3);
  });
  it('rejects duplicate effective instants, retrospective rewriting, endpoints and stale versions',async()=>{
    const {id}=await create(); await replace(change(id));
    for(const effectiveAt of ['2026-10-16T08:00','2026-10-15T08:00','2026-10-21T08:00']) await expect(replace(change(id,2,{outgoing:'Técnico C',incoming:'Técnico D',effectiveAt}))).rejects.toMatchObject({code:'GUARD_CHANGE_ORDER'});
    await expect(replace(change(id,1,{effectiveAt:'2026-10-19T08:00'}))).rejects.toMatchObject({code:'STALE_VERSION'});
    expect((await readCrews(db,admin,windowFrom,windowTo))[0].segments).toHaveLength(2);
  });
  it('rejects nonexistent, out-of-catalog or duplicate members and invalid dates',async()=>{
    await expect(create(input({technicians:['Técnico A','Inventado']}))).rejects.toMatchObject({code:'GUARD_TECHNICIAN_UNKNOWN'});
    await expect(create(input({technicians:['Técnico A',' tecnico a ']}))).rejects.toMatchObject({code:'DUPLICATE_TECHNICIANS'});
    for(const startAt of ['2026-10-14T05:00','2026-02-31T08:00','2026-10-14T24:00']) await expect(create(input({startAt}))).rejects.toMatchObject({code:'GUARD_PERIOD_INVALID'});
    const {id}=await create(); await expect(replace(change(id,1,{incoming:'Inventado'}))).rejects.toMatchObject({code:'GUARD_TECHNICIAN_UNKNOWN'});
    expect(()=>guardInstant('2026-02-31T08:00')).toThrow('GUARD_PERIOD_INVALID');
  });
  it('fails closed for ungranted coordinators and CTIC; blocks writes and reads outside the actual allowed zone',async()=>{
    const noGrants={...coordinator,zones:[]};
    expect(canWriteCrews(noGrants)).toBe(false);
    await expect(create(input(),noGrants)).rejects.toMatchObject({code:'FORBIDDEN_PROJECT'});
    await expect(create(input(),{...admin,ctic:true})).rejects.toMatchObject({code:'FORBIDDEN_PROJECT'});
    const {id}=await create(input({zone:'BAM'}));
    expect(await readCrews(db,coordinator,windowFrom,windowTo)).toEqual([]);
    await expect(replace(change(id),coordinator)).rejects.toMatchObject({code:'FORBIDDEN_PROJECT'});
    expect(await readCrews(db,{...coordinator,ctic:true},windowFrom,windowTo)).toHaveLength(1);
  });
  it('allows scoped coordinators only real in-scope catalog technicians, without binding a permanent pair to a zone',async()=>{
    await create(input(),coordinator);
    await expect(create(input({zone:'BAM'}),coordinator)).rejects.toMatchObject({code:'FORBIDDEN_PROJECT'});
    await expect(create(input({zone:'BAM',technicians:['Técnico C','Técnico D']}),{...admin,technicians:['Técnico A','Técnico B']})).rejects.toMatchObject({code:'GUARD_TECHNICIAN_UNKNOWN'});
  });
  it('rejects overlapping zone or technician coverage, including reversed pair order, but accepts adjacent handovers',async()=>{
    await create();
    await expect(create(input({technicians:['Técnico B','Técnico A']}))).rejects.toMatchObject({code:'GUARD_OVERLAP'});
    await expect(create(input({technicians:['Técnico C','Técnico D']}))).rejects.toMatchObject({code:'GUARD_OVERLAP'});
    await expect(create(input({zone:'BAM',technicians:['Técnico A','Técnico C']}))).rejects.toMatchObject({code:'GUARD_OVERLAP'});
    await create(input({startAt:'2026-10-21T08:00',endAt:'2026-10-28T08:00'}));
  });
  it('is idempotent on creation/replacement retries and rejects request-key reuse with changed payload',async()=>{
    const data=input(), {id}=await create(data); expect(await create(data)).toMatchObject({id,alreadySaved:true});
    await expect(create({...data,zone:'BAM'})).rejects.toMatchObject({code:'REQUEST_KEY_REUSED'});
    const c=change(id); await replace(c); expect(await replace(c)).toMatchObject({alreadySaved:true});
    await expect(replace({...c,reason:'Otro motivo'})).rejects.toMatchObject({code:'REQUEST_KEY_REUSED'});
    expect(await db.query('SELECT * FROM ops_guard_crew_changes')).toHaveLength(1);
  });
  it('requires explicit matching legacy selections, preserves the original rows and prevents re-linking',async()=>{
    const ids=['00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-0000000000bb'];
    for(let i=0;i<2;i++) await pg.query("INSERT INTO ops_guard_periods VALUES($1,$2,'2026-10-14','2026-10-21')",[ids[i],admin.technicians[i]]);
    await expect(create()).rejects.toMatchObject({code:'GUARD_LEGACY_OVERLAP'});
    await expect(create(input({legacyIds:ids,endAt:'2026-10-22T08:00'}))).rejects.toMatchObject({code:'GUARD_LEGACY_INVALID'});
    await expect(create(input({legacyIds:ids}),coordinator)).rejects.toMatchObject({code:'FORBIDDEN'});
    await create(input({legacyIds:ids}));
    expect(await db.query('SELECT * FROM ops_guard_periods')).toHaveLength(2);
    await expect(create(input({legacyIds:ids}))).rejects.toMatchObject({code:'GUARD_LEGACY_INVALID'});
  });
  it('rolls back header/history/version atomically if the audit insert fails',async()=>{
    const {id}=await create();
    await pg.exec("ALTER TABLE ops_events ADD CONSTRAINT reject_replace CHECK(action <> 'GUARD_CREW_REPLACED')");
    await expect(replace(change(id))).rejects.toThrow();
    const [crew]=await readCrews(db,admin,windowFrom,windowTo);
    expect(crew.version).toBe(1); expect(crew.changes).toHaveLength(0); expect(crew.segments[0].technicians).toEqual(['Técnico A','Técnico B']);
  });
});
