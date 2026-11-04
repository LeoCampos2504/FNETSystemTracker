import { describe, expect, it } from "vitest";
import type { SiteFuelLoad } from "@/contracts/operations";
import { fuelInDateRange, reconcileFuelLoads, reviewedFuelByOperation } from "./site-fuel-loads";
const load=(id:string,changes:Partial<SiteFuelLoad>={}):SiteFuelLoad=>({id,formCode:"FO-26-000001",siteCode:"ST00001",siteName:"Sitio de prueba",project:"NON - MPC",date:"2026-11-01T11:00:00Z",liters:40,fuel:null,levelBefore:"30",levelAfter:"70",hourmeter:"120",origin:"PREVENTIVO",source:"Sytex",link:null,...changes});
describe("fuel events, never site totals",()=>{
  it("keeps all dates at the same site across preventive, corrective and other forms",()=>{
    const rows=reconcileFuelLoads([load("a"),load("b",{formCode:"FO-26-000002",date:"2026-11-03T11:00:00Z",origin:"CORRECTIVO"}),load("c",{formCode:"FO-26-000003",date:"2026-11-02T11:00:00Z",origin:"OTRO"})]);
    expect(rows.map(r=>r.id)).toEqual(["b","c","a"]);
  });
  it("does not discard a second n8n event just because Sytex has the same form",()=>{
    const rows=reconcileFuelLoads([load("a"),load("b",{source:"n8n",date:"2026-11-02T11:00:00Z"})]);
    expect(rows).toHaveLength(2);expect(rows.every(r=>r.possibleDuplicate)).toBe(true);
  });
  it("reconciles only a unique exact cross-source event, keeping the n8n event metadata",()=>{
    expect(reconcileFuelLoads([load("a"),load("b",{source:"n8n"})]).map(r=>r.id)).toEqual(["b"]);
    expect(reconcileFuelLoads([load("a"),load("b",{source:"n8n",date:null})])).toHaveLength(2);
    expect(reconcileFuelLoads([load("a"),load("a2"),load("b",{source:"n8n"})])).toHaveLength(3);
  });
  it("keeps events with different meters or sites even with the same form/time/amount",()=>{
    expect(reconcileFuelLoads([load("a"),load("b",{source:"n8n",hourmeter:"121"}),load("c",{source:"n8n",siteCode:"ST00002"})])).toHaveLength(3);
  });
  it("filters instant dates in Argentina and includes undated events when no dates are selected",()=>{
    expect(fuelInDateRange("2026-11-02T01:30:00Z",{from:"2026-11-01",to:"2026-11-01"})).toBe(true);
    expect(fuelInDateRange(null,{from:"",to:""})).toBe(true);
    expect(fuelInDateRange("2026-11-02",{from:"2026-11-01",to:"2026-11-01"})).toBe(false);
  });
  it("sums only OK events by operation, combining task types and reversing a check",()=>{
    const review={ok:true,version:1,sourceHash:"test",updatedAt:null,updatedBy:null};
    const rows=[load("a",{review,liters:10.01}),load("b",{review,project:"NON - MCC",liters:20.125}),load("c",{review,project:"BAS - MPC",liters:50}),load("d",{liters:999})];
    expect(reviewedFuelByOperation(rows)).toEqual([{operation:"BAS",liters:50,count:1,unknownLiters:0},{operation:"NON",liters:30.135,count:2,unknownLiters:0}]);
    expect(reviewedFuelByOperation(rows.map(r=>r.id==="a"?{...r,review:{...review,ok:false}}:r))[1].liters).toBe(20.125);
  });
});
