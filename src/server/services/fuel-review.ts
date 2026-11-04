import { createHash } from "node:crypto";
import { z } from "zod";
import type { FuelReview, SiteFuelLoad } from "@/contracts/operations";
import { getPrismaClient } from "@/server/prisma";
import { allowedProject } from "@/server/operations-domain";
import { audit, fail, type OperationsActor } from "./operations";

export const fuelReviewInput = z.object({ id: z.string().min(1).max(2500), ok: z.boolean(), version: z.number().int().nonnegative(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
type Saved = { resource_key:string; detail:FuelReview; created_at:Date; name:string };
const key = (id:string) => "fuel:" + id;
/** Changed quantity, site or event date requires a new review. A review never modifies the source load. */
export const fuelReviewHash = (r:SiteFuelLoad) => createHash("sha256").update(JSON.stringify([r.id,r.formCode,r.siteCode,r.project,r.date,r.dateBasis??"LOAD",r.liters,r.levelBefore,r.levelAfter,r.hourmeter,r.fuel])).digest("hex");
export async function attachFuelReviews(rows:SiteFuelLoad[]):Promise<SiteFuelLoad[]> {
  if (!rows.length) return rows;
  const events = await getPrismaClient().$queryRaw<Saved[]>`SELECT DISTINCT ON (e.resource_key) e.resource_key,e.detail,e.created_at,u.name
    FROM ops_events e JOIN app_users u ON u.id=e.actor_id
    WHERE e.action='FUEL_REVIEW' AND e.resource_key=ANY(${rows.map(r=>key(r.id))}::text[])
    ORDER BY e.resource_key,(e.detail->>'version')::integer DESC,e.created_at DESC,e.id DESC`;
  const saved = new Map(events.map(e=>[e.resource_key,e]));
  return rows.map(row=>{
    const event=saved.get(key(row.id)), sourceHash=fuelReviewHash(row);
    return {...row,review:{ok:event?.detail.sourceHash===sourceHash&&event.detail.ok===true,changed:!!event&&event.detail.sourceHash!==sourceHash,version:event?.detail.version??0,sourceHash,updatedAt:event?.created_at.toISOString()??null,updatedBy:event?.name??null}};
  });
}
export async function saveFuelReview(actor:OperationsActor,input:z.infer<typeof fuelReviewInput>,load:()=>Promise<SiteFuelLoad[]>) {
  if (actor.ctic || !['ADMIN','COORDINATOR'].includes(actor.user.role)) fail('FORBIDDEN',403);
  const row=(await load()).find(r=>r.id===input.id);
  if (!row) fail('FUEL_NOT_FOUND',404);
  if (actor.allowed!==null&&!allowedProject(row.project,actor.allowed)) fail('FORBIDDEN_PROJECT',403);
  if (fuelReviewHash(row)!==input.sourceHash) fail('FUEL_CHANGED',409);
  return getPrismaClient().$transaction(async tx=>{
    await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${key(row.id)}))) AS lock`;
    const [previous]=await tx.$queryRaw<{detail:FuelReview}[]>`SELECT detail FROM ops_events WHERE resource_key=${key(row.id)} AND action='FUEL_REVIEW' ORDER BY (detail->>'version')::integer DESC,created_at DESC,id DESC LIMIT 1`;
    if ((previous?.detail.version??0)!==input.version) fail('STALE_VERSION',409);
    const version=input.version+1;
    await audit(tx,actor,key(row.id),'FUEL_REVIEW',{ok:input.ok,sourceHash:input.sourceHash,version,project:row.project,formCode:row.formCode,siteCode:row.siteCode,liters:row.liters});
    return {saved:true,version};
  });
}
