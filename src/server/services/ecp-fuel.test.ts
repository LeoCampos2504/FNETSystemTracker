import { describe, expect, it, vi } from 'vitest';
vi.mock('@/server/prisma', () => ({ getPrismaClient: vi.fn() }));
import { ecpFuelFromSupplies, type FormSupply, type StoredAnswer } from './site-control';
import { fuelInDateRange, reconcileFuelLoads, reviewedFuelByOperation } from '@/lib/site-fuel-loads';
const task = { code: 'FO-26-000001', description: 'ECP - Mantenimiento Preventivo Civil', siteCode: 'ST00001', siteName: 'Prueba', project: 'NON - MPC' };
const supply = (description: string, n: number, quantity = '10.125'): FormSupply => ({ formCode: task.code, groupName: `[#${n}] Insumo`, position: `9.2${n}`, description, quantity, usedQuantity: true });
const read = (items: FormSupply[], answers: StoredAnswer[] = []) => ecpFuelFromSupplies(items, [task], answers, new Map([[task.code, 'https://fv.sytex.io/example']]));
describe('ECP fuel declared as used supplies', () => {
  it('keeps every diesel line and its identity, even repeated descriptions, without guessing tank metadata', () => {
    const rows = read(['Diésel 500', 'Diésel 500', 'Diesel 500 GM1', 'Diesel 500 GM 2'].map((s,i) => supply(s,i+1)));
    expect(rows).toHaveLength(4); expect(new Set(rows.map(r=>r.id)).size).toBe(4);
    expect(rows.every(r=>r.evidence==='SUPPLY_DECLARATION'&&r.liters===10.125&&r.date===null&&r.dateBasis==='UNVERIFIED'&&r.levelBefore===null&&r.hourmeter===null)).toBe(true);
    expect(rows[2].fuel).toBe('Diesel 500 GM1');
    expect(fuelInDateRange(rows[0].date,{from:'',to:''})).toBe(true);
  });
  it('excludes lawnmower gasoline, oil, parts and purchased supplies', () => {
    expect(read(['Nafta Super','5 litros de nafta super','Aceite 2T','Tanza','Filtro diesel','Diesel comprado','Diesel envase'].map((s,i)=>supply(s,i)))).toEqual([]);
  });
  it('does not turn supplies of unrelated templates or ambiguous multi-site forms into ECP consumption', () => {
    const items=[supply('Gasoil',1)];
    expect(ecpFuelFromSupplies(items,[{...task,description:'Otro formulario'}],[],new Map())).toEqual([]);
    expect(ecpFuelFromSupplies(items,[{...task,siteCode:'ST00001, ST00002'}],[],new Map())).toEqual([]);
  });
  it('requires explicit quantity-used evidence, not a purchase or a generic amount', () => {
    expect(read([{...supply('Diesel',1),usedQuantity:false},{...supply('Diesel',2),usedQuantity:undefined}])).toEqual([]);
  });
  it('requires a positive quantity and stable source row identity', () => {
    expect(read([supply('Diesel',1,'0'),supply('Diesel',2,'-1'),supply('Diesel',3,'sin dato'),{...supply('Diesel',4),position:undefined}])).toEqual([]);
  });
  it('uses explicit FO realization, never last edit or approval time', () => {
    const rows=read([supply('Gasoil',1)],[{formCode:task.code,siteCode:task.siteCode,siteName:'Prueba',topic:'EJECUCION',groupName:'General',position:'1',question:'El Mantenimiento Correctivo Inicia el:',answer:'2026-10-02 08:00:00',reportedAt:'2026-10-13T20:00:00'}]);
    expect(rows[0]).toMatchObject({date:'2026-10-02T11:00:00.000Z',dateBasis:'FORM_START'});
  });
  it('flags overlap with structured tank evidence, preserving both instead of silently double certifying', () => {
    const [declared]=read([supply('Diesel',1)]);
    const rows=reconcileFuelLoads([declared,{...declared,id:'sytex:tank',evidence:undefined,levelBefore:'50',date:'2026-10-02T11:00:00Z',dateBasis:'LOAD'}]);
    expect(rows).toHaveLength(2); expect(rows.every(r=>r.possibleDuplicate)).toBe(true);
    expect(reviewedFuelByOperation(rows)).toEqual([]);
  });
});
