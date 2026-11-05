import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/contracts";
const mock=vi.hoisted(()=>({answers:vi.fn(),fuel:vi.fn(),catalog:vi.fn(),reviews:vi.fn(),supplies:vi.fn()}));
vi.mock("@/server/prisma",()=>({getPrismaClient:()=>({sytex_site_answers:{findMany:mock.answers},cargas_combustible_ge:{findMany:mock.fuel},sytex_site_maintenance:{findMany:async()=>[]},sytex_form_links:{findMany:async()=>[]},sytex_supply_import_items:{findMany:mock.supplies},insumos:{findMany:async()=>[]}})}));
vi.mock("./operations",()=>({catalog:mock.catalog,yearlyMaintenance:()=>[]}));
vi.mock("./fuel-review",()=>({attachFuelReviews:mock.reviews}));
import { siteControl } from "./site-control";
const actor={user:{id:"test",role:"ADMIN"} as User,allowed:null};
const task=(code:string,project:string,type:string)=>({code,project,type,description:"Formulario de prueba",siteCode:"ST00001",siteName:"Prueba",technicians:[]});
const load=(id:bigint,form="FO-26-000001")=>({id,formulario:form,codigo_sitio:"ST00001",nombre_sitio:"Prueba",origen:"CORRECTIVO",combustible:"Gasoil",litros_cargados:50,nivel_antes:null,nivel_final:null,horometro:null,fecha_evento:new Date(`2026-11-0${id}T11:00:00Z`)});
beforeEach(()=>{
  vi.resetAllMocks();mock.supplies.mockResolvedValue([]);mock.answers.mockResolvedValue([]);mock.fuel.mockResolvedValue([]);mock.reviews.mockImplementation(async r=>r);
  mock.catalog.mockResolvedValue({tasks:[task("FO-26-000001","NON - MCC","CORRECTIVO"),task("FO-26-000002","BAS - MPC","PREVENTIVO")],projects:[]});
});
describe("fuel overview reads every authorized event",()=>{
  it('uses only the newest ECP supply download, preserving its individual lines',async()=>{
    mock.catalog.mockResolvedValue({tasks:[{...task('FO-26-000001','NON - MPC','PREVENTIVO'),description:'ECP - Mantenimiento Preventivo Civil'}],projects:[]});
    const row={formulario:'FO-26-000001',grupo:'[#1] Insumo',indice:'9.2A',description:'Diésel 500',sourceAnswers:[{question:'Cantidad utilizada:'}],quantity:'10.125',import:{importedAt:new Date('2026-11-04T11:00Z')}};
    mock.supplies.mockResolvedValue([{...row,quantity:'999',import:{importedAt:new Date('2026-11-03T11:00Z')}},row,{...row,grupo:'[#2] Insumo',indice:'9.2B'}]);
    const result=await siteControl(actor);
    expect(result.fuel).toHaveLength(2);expect(result.fuel.every(r=>r.liters===10.125&&r.origin==='ECP')).toBe(true);
    expect(result.sites[0].siteCode).toBe('ST00001');
  });
  it('filters ECP supplies by server-side project scope before loading reviews',async()=>{
    mock.catalog.mockResolvedValue({tasks:[{...task('FO-26-000001','NON - MPC','PREVENTIVO'),description:'ECP - Civil'}],projects:[]});
    mock.supplies.mockResolvedValue([{formulario:'FO-26-000001',grupo:'[#1] Insumo',indice:'9.2A',description:'Gasoil',sourceAnswers:[{question:'Cantidad utilizada:'}],quantity:'10',import:{importedAt:new Date()}}]);
    expect((await siteControl({...actor,allowed:['BAS - MPC']})).fuel).toEqual([]);
    expect(mock.reviews.mock.calls[0][0]).toEqual([]);
  });
  it("keeps n8n events alongside a Sytex fuel answer of the same form",async()=>{
    mock.answers.mockResolvedValue([{formCode:"FO-26-000001",siteCode:"ST00001",siteName:"Prueba",topic:"COMBUSTIBLE",groupName:"General",position:"1",question:"Litros de combustible cargados",answer:"40",reportedAt:"2026-11-03T08:00:00",import:{importedAt:new Date("2026-11-04T11:00Z")}}]);
    mock.fuel.mockResolvedValue([load(BigInt(1)),load(BigInt(2))]);
    const result=await siteControl(actor);expect(result.fuel).toHaveLength(3);expect(result.fuel.map(r=>r.liters).sort()).toEqual([40,50,50]);
    expect(result.fuel.every(r=>r.date===null&&r.dateBasis==='UNVERIFIED')).toBe(true);
  });
  it("does not reduce a site's loads to its last record",async()=>{
    mock.fuel.mockResolvedValue([load(BigInt(1)),load(BigInt(2)),load(BigInt(3))]);
    const result=await siteControl(actor);expect(result.sites).toHaveLength(1);expect(result.fuel).toHaveLength(3);
    expect(result.fuel.map(r=>r.id).sort()).toEqual(['n8n:1','n8n:2','n8n:3']);
    expect(result.sites[0].lastFuel?.date).toBeNull();
  });
  it('uses the FO work start for n8n too, without presenting its old edit timestamp as realization',async()=>{
    mock.answers.mockResolvedValue([{formCode:'FO-26-000001',siteCode:'ST00001',siteName:'Prueba',topic:'EJECUCION',groupName:'General',position:'1',question:'El Mantenimiento Correctivo Inicia el:',answer:'2026-10-02 10:00:00',reportedAt:'2026-10-13T17:25:45',import:{importedAt:new Date('2026-11-04T11:00Z')}}]);
    mock.fuel.mockResolvedValue([load(BigInt(1))]);
    const result=await siteControl(actor);
    expect(result.fuel[0]).toMatchObject({date:'2026-10-02T13:00:00.000Z',dateBasis:'FORM_START',reportedAt:'2026-11-01T11:00:00.000Z'});
  });
  it("limits both the result and loaded review history to allowed projects",async()=>{
    mock.fuel.mockResolvedValue([load(BigInt(1)),load(BigInt(2),"FO-26-000002")]);
    const result=await siteControl({...actor,allowed:["BAS - MPC"]});expect(result.fuel.map(r=>r.formCode)).toEqual(["FO-26-000002"]);
    expect(mock.reviews.mock.calls[0][0]).toHaveLength(1);
  });
  it.each(["fuel","answers","supplies"] as const)("reports a failed %s source instead of returning a misleading complete empty list",async(source)=>{
    mock[source].mockRejectedValue(new Error("unavailable"));await expect(siteControl(actor)).rejects.toThrow("unavailable");
  });
});
