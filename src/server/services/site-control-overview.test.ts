import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/contracts";
const mock=vi.hoisted(()=>({answers:vi.fn(),fuel:vi.fn(),catalog:vi.fn(),reviews:vi.fn()}));
vi.mock("@/server/prisma",()=>({getPrismaClient:()=>({sytex_site_answers:{findMany:mock.answers},cargas_combustible_ge:{findMany:mock.fuel},sytex_site_maintenance:{findMany:async()=>[]},sytex_form_links:{findMany:async()=>[]},sytex_supply_import_items:{findMany:async()=>[]},insumos:{findMany:async()=>[]}})}));
vi.mock("./operations",()=>({catalog:mock.catalog,yearlyMaintenance:()=>[]}));
vi.mock("./fuel-review",()=>({attachFuelReviews:mock.reviews}));
import { siteControl } from "./site-control";
const actor={user:{id:"test",role:"ADMIN"} as User,allowed:null};
const task=(code:string,project:string,type:string)=>({code,project,type,siteCode:"ST00001",siteName:"Prueba",technicians:[]});
const load=(id:bigint,form="FO-26-000001")=>({id,formulario:form,codigo_sitio:"ST00001",nombre_sitio:"Prueba",origen:"CORRECTIVO",combustible:"Gasoil",litros_cargados:50,nivel_antes:null,nivel_final:null,horometro:null,fecha_evento:new Date(`2026-11-0${id}T11:00:00Z`)});
beforeEach(()=>{
  vi.resetAllMocks();mock.answers.mockResolvedValue([]);mock.fuel.mockResolvedValue([]);mock.reviews.mockImplementation(async r=>r);
  mock.catalog.mockResolvedValue({tasks:[task("FO-26-000001","NON - MCC","CORRECTIVO"),task("FO-26-000002","BAS - MPC","PREVENTIVO")],projects:[]});
});
describe("fuel overview reads every authorized event",()=>{
  it("keeps n8n events alongside a Sytex fuel answer of the same form",async()=>{
    mock.answers.mockResolvedValue([{formCode:"FO-26-000001",siteCode:"ST00001",siteName:"Prueba",topic:"COMBUSTIBLE",groupName:"General",position:"1",question:"Litros de combustible cargados",answer:"40",reportedAt:"2026-11-03T08:00:00",import:{importedAt:new Date("2026-11-04T11:00Z")}}]);
    mock.fuel.mockResolvedValue([load(BigInt(1)),load(BigInt(2))]);
    const result=await siteControl(actor);expect(result.fuel).toHaveLength(3);expect(result.fuel.map(r=>r.liters)).toEqual([40,50,50]);
  });
  it("does not reduce a site's loads to its last record",async()=>{
    mock.fuel.mockResolvedValue([load(BigInt(1)),load(BigInt(2)),load(BigInt(3))]);
    const result=await siteControl(actor);expect(result.sites).toHaveLength(1);expect(result.fuel).toHaveLength(3);expect(result.sites[0].lastFuel?.id).toBe("n8n:3");
  });
  it("limits both the result and loaded review history to allowed projects",async()=>{
    mock.fuel.mockResolvedValue([load(BigInt(1)),load(BigInt(2),"FO-26-000002")]);
    const result=await siteControl({...actor,allowed:["BAS - MPC"]});expect(result.fuel.map(r=>r.formCode)).toEqual(["FO-26-000002"]);
    expect(mock.reviews.mock.calls[0][0]).toHaveLength(1);
  });
  it.each(["fuel","answers"] as const)("reports a failed %s source instead of returning a misleading complete empty list",async(source)=>{
    mock[source].mockRejectedValue(new Error("unavailable"));await expect(siteControl(actor)).rejects.toThrow("unavailable");
  });
});
