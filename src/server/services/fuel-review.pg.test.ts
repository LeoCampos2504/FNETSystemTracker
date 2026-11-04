import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/contracts";
import type { SiteFuelLoad } from "@/contracts/operations";
import type { OperationsActor } from "./operations";
const state=vi.hoisted(()=>({db:{} as Record<string,unknown>}));
vi.mock("@/server/prisma",()=>({getPrismaClient:()=>state.db}));
import { attachFuelReviews, fuelReviewHash, saveFuelReview } from "./fuel-review";

const actor:OperationsActor={user:{id:"00000000-0000-4000-8000-000000000001",name:"Admin de prueba",role:"ADMIN"} as User,allowed:null};
const row:SiteFuelLoad={id:"n8n:1",formCode:"FO-26-000001",siteCode:"ST00001",siteName:"Sitio prueba",project:"NON - MPC",date:"2026-11-01T11:00:00Z",liters:40,fuel:"Gasoil",levelBefore:null,levelAfter:null,hourmeter:null,origin:"PREVENTIVO",source:"n8n",link:null};
let pg:PGlite;
type Query={query:<T>(s:string,p:unknown[])=>Promise<{rows:T[];affectedRows?:number}>};
function adapter(client:Query) {
  const query=<T>(parts:TemplateStringsArray,values:unknown[])=>client.query<T>(parts.reduce((s,p,i)=>s+(i?`$${i}`:"")+p,""),values);
  return {$queryRaw:<T>(parts:TemplateStringsArray,...values:unknown[])=>query<T>(parts,values).then(r=>r.rows),$executeRaw:(parts:TemplateStringsArray,...values:unknown[])=>query(parts,values).then(r=>r.affectedRows??0)};
}
const input=(ok=true,version=0)=>({id:row.id,ok,version,sourceHash:fuelReviewHash(row)});
beforeEach(async()=>{
  pg=new PGlite();
  await pg.exec("CREATE TABLE app_users(id UUID PRIMARY KEY,name TEXT NOT NULL); CREATE TABLE ops_events(id UUID PRIMARY KEY,resource_key TEXT,action TEXT,actor_id UUID REFERENCES app_users(id),detail JSONB,created_at TIMESTAMPTZ DEFAULT clock_timestamp());");
  await pg.query("INSERT INTO app_users VALUES($1,$2)",[actor.user.id,actor.user.name]);
  state.db={...adapter(pg),$transaction:<T>(fn:(tx:ReturnType<typeof adapter>)=>Promise<T>)=>pg.transaction(tx=>fn(adapter(tx)))};
});
afterEach(async()=>{await pg.close();});
describe("shared fuel OK on existing audit storage, synthetic PostgreSQL",()=>{
  it("persists, reloads and reverses OK with immutable actor/date history",async()=>{
    expect((await attachFuelReviews([row]))[0].review).toMatchObject({ok:false,version:0});
    await saveFuelReview(actor,input(),async()=>[row]);
    expect((await attachFuelReviews([row]))[0].review).toMatchObject({ok:true,version:1,updatedBy:actor.user.name});
    await saveFuelReview(actor,input(false,1),async()=>[row]);
    expect((await attachFuelReviews([row]))[0].review).toMatchObject({ok:false,version:2});
    const events=await pg.query<{detail:{ok:boolean};actor_id:string;created_at:Date}>("SELECT * FROM ops_events ORDER BY created_at");
    expect(events.rows.map(r=>r.detail.ok)).toEqual([true,false]);expect(events.rows.every(r=>r.actor_id===actor.user.id&&r.created_at)).toBe(true);
  });
  it("rejects stale concurrent versions without losing the previous OK",async()=>{
    await saveFuelReview(actor,input(),async()=>[row]);
    await expect(saveFuelReview(actor,input(false),async()=>[row])).rejects.toMatchObject({code:"STALE_VERSION"});
    expect((await attachFuelReviews([row]))[0].review?.ok).toBe(true);
    expect((await pg.query("SELECT id FROM ops_events")).rows).toHaveLength(1);
  });
  it("uses the committed version even if transaction timestamps arrive out of order",async()=>{
    await saveFuelReview(actor,input(),async()=>[row]);
    await saveFuelReview(actor,input(false,1),async()=>[row]);
    await pg.exec("UPDATE ops_events SET created_at='2026-01-01' WHERE (detail->>'version')::integer=2");
    expect((await attachFuelReviews([row]))[0].review).toMatchObject({ok:false,version:2});
    await saveFuelReview(actor,input(true,2),async()=>[row]);
    expect((await attachFuelReviews([row]))[0].review).toMatchObject({ok:true,version:3});
  });
  it("invalidates OK if the source quantity/site/date changes and rejects old evidence",async()=>{
    await saveFuelReview(actor,input(),async()=>[row]);
    const changed={...row,liters:60};
    expect((await attachFuelReviews([changed]))[0].review).toMatchObject({ok:false,version:1});
    await expect(saveFuelReview(actor,input(false,1),async()=>[changed])).rejects.toMatchObject({code:"FUEL_CHANGED"});
  });
  it("checks project authorization on the server and rejects nonexistent loads",async()=>{
    await expect(saveFuelReview({...actor,allowed:["BAS - MPC"]},input(),async()=>[row])).rejects.toMatchObject({code:"FORBIDDEN_PROJECT"});
    await expect(saveFuelReview(actor,input(),async()=>[])).rejects.toMatchObject({code:"FUEL_NOT_FOUND"});
    await expect(saveFuelReview({...actor,ctic:true},input(),async()=>[row])).rejects.toMatchObject({code:"FORBIDDEN"});
    expect((await pg.query("SELECT id FROM ops_events")).rows).toHaveLength(0);
  });
  it("rolls back without saving a false OK if audit insertion fails",async()=>{
    await pg.exec("ALTER TABLE ops_events ADD CONSTRAINT reject_test CHECK(action <> 'FUEL_REVIEW')");
    await expect(saveFuelReview(actor,input(),async()=>[row])).rejects.toThrow();
    expect((await attachFuelReviews([row]))[0].review?.ok).toBe(false);
  });
});
