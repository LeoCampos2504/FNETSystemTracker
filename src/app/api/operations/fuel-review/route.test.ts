import { beforeEach, describe, expect, it, vi } from "vitest";
const mock=vi.hoisted(()=>({session:vi.fn(),save:vi.fn(),sites:vi.fn()}));
vi.mock("@/server/operations-http",()=>({requireOperationsSession:mock.session}));
vi.mock("@/server/services/site-control",()=>({siteControl:mock.sites}));
vi.mock("@/server/services/fuel-review",async(importOriginal)=>({...await importOriginal<typeof import("@/server/services/fuel-review")>(),saveFuelReview:mock.save}));
import { POST } from "./route";
const body={id:"n8n:1",ok:true,version:0,sourceHash:"a".repeat(64)};
const request=(payload:unknown=body,origin="https://fnet.example.invalid")=>new Request("https://fnet.example.invalid/api/operations/fuel-review",{method:"POST",headers:{"content-type":"application/json",origin},body:JSON.stringify(payload)});
beforeEach(()=>{vi.clearAllMocks();mock.session.mockResolvedValue({ok:true,actor:{user:{id:"admin",role:"ADMIN"},allowed:null}});mock.save.mockResolvedValue({saved:true,version:1});mock.sites.mockResolvedValue({fuel:[]});});
describe("fuel OK endpoint",()=>{
  it("requires a session before reading a load or writing a review",async()=>{
    mock.session.mockResolvedValue({ok:false,response:new Response(null,{status:401})});expect((await POST(request())).status).toBe(401);expect(mock.save).not.toHaveBeenCalled();
  });
  it("rejects cross-site writes and forged project/quantity fields",async()=>{
    expect((await POST(request(body,"https://other.example.invalid"))).status).toBe(403);
    expect((await POST(request({...body,liters:999,project:"NON"}))).status).toBe(422);expect(mock.save).not.toHaveBeenCalled();
  });
  it("uses authorized server data instead of trusting client load details",async()=>{
    const response=await POST(request());expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");
    const [actor,input,loader]=mock.save.mock.calls[0];expect(input).toEqual(body);await loader();expect(mock.sites).toHaveBeenCalledWith(actor);
  });
});
