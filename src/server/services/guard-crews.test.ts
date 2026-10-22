import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {OperationsActor} from './operations';
const m=vi.hoisted(()=>({catalog:vi.fn(),transaction:vi.fn(),query:vi.fn()}));
vi.mock('./operations',()=>({catalog:m.catalog,fail:(code:string,status:number)=>{throw Object.assign(Error(code),{code,status});}}));
vi.mock('@/server/prisma',()=>({getPrismaClient:()=>({$queryRawUnsafe:m.query,$transaction:m.transaction})}));
import {addGuardCrew,guardCrewAccess,crewOverview} from './guard-crews';
const actor={user:{id:'00000000-0000-4000-8000-000000000001',role:'COORDINATOR'},allowed:['NOA - MPC Mantenimiento']} as OperationsActor;
beforeEach(()=>{vi.clearAllMocks();m.catalog.mockResolvedValue({projects:['NOA - MPC Mantenimiento','NOA - MCC Correctivo'],technicians:['Técnico A','Técnico B']});m.query.mockResolvedValue([{ready:false}]);m.transaction.mockImplementation(async run=>run({$queryRawUnsafe:m.query}));});
describe('guard crew server access and transaction wiring',()=>{
  it('derives real zones and technicians from the scoped catalog, not synthetic fixtures',async()=>{expect(await guardCrewAccess(actor)).toMatchObject({admin:false,zones:['NOA'],technicians:['Técnico A','Técnico B']});expect(m.catalog).toHaveBeenCalledWith(actor);});
  it('fails closed without explicit coordinator grants, even if the legacy allowed value is null',async()=>{expect(await guardCrewAccess({...actor,allowed:null})).toMatchObject({zones:[],technicians:[]});expect(m.catalog).not.toHaveBeenCalled();});
  it('gives CTIC no catalog/write access and reports missing storage explicitly',async()=>{const data=await crewOverview({...actor,ctic:true},'2026-10-01','2026-10-31');expect(data).toMatchObject({canManageCrews:false,crewStorageReady:false,crews:[],zones:[]});expect(m.catalog).not.toHaveBeenCalled();});
  it('checks storage inside a Prisma transaction, does not fall back to client-only persistence',async()=>{await expect(addGuardCrew(actor,{requestKey:crypto.randomUUID(),zone:'NOA',technicians:['Técnico A','Técnico B'],startAt:'2026-10-14T08:00',endAt:'2026-10-21T08:00',legacyIds:[]})).rejects.toMatchObject({code:'GUARD_STORAGE_PENDING'});expect(m.transaction).toHaveBeenCalledTimes(1);expect(m.query.mock.calls.some(([sql])=>String(sql).includes('INSERT'))).toBe(false);});
});
