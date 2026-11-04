import { describe, expect, it } from 'vitest';
import type { IntraLine, IntraOverview, IntraTarget } from '@/contracts/intra-stock';
import { allocationLimits, applyIntraSnapshot, emptyIntraState, intraFuel, intraFuelTotals, lineUse, targetAvailable } from './intra-stock';
const line: IntraLine={id:'a',date:'2026-11-03',invoice:'0001',supplier:'Proveedor prueba',scope:'MED - NON - Salta',operation:'NON',location:'Salta',product:'Gasoil Premium',quantity:187.33,net:1000,liquidated:'NO',fuel:true,duplicate:false};
const target: IntraTarget={id:'load1',kind:'FUEL',hash:'a'.repeat(64),operation:'NON',description:'Combustible',quantity:375.01,date:'2026-11-03',formCode:'FO-26-000001',siteCode:'ST00001'};
const state=():IntraOverview=>({...emptyIntraState(),targets:[target],scopes:[{name:line.scope,fileName:'prueba.xlsx',fingerprint:'x',importedAt:'2026-11-04',importedBy:'Admin'}],records:applyIntraSnapshot(emptyIntraState(),[line,{...line,id:'b',invoice:'0002'}],[line.scope],'2026-11-04')});
const linked=():IntraOverview=>{const s=state();s.allocations=s.records.map(r=>({id:r.id,lineId:r.id,targetId:target.id,targetKind:target.kind,targetHash:target.hash,quantity:187.33,description:'Combustible',formCode:target.formCode,createdAt:'2026-11-04',createdBy:'Admin',active:true}));return s;};
describe('Intra pending stock versus explicitly linked usage',()=>{
  it('shows the 0.35 difference between 375.01 used and two invoices of 187.33, never rounding it away',()=>{
    expect(intraFuelTotals(linked())[0]).toMatchObject({pending:374.66,used:374.66,remaining:0,unlinked:0.35});
    expect(intraFuelTotals(state())[0]).toMatchObject({used:0,remaining:374.66,unlinked:375.01});
  });
  it('archives disappearing invoices, preserves their usage and never subtracts them from the next snapshot twice',()=>{
    const s=linked(); s.records=applyIntraSnapshot(s,[],[line.scope],'2026-11-05');
    expect(s.records).toHaveLength(2); expect(s.records[0]).toMatchObject({present:false,firstSeen:'2026-11-04',missingSince:'2026-11-05'});
    expect(intraFuelTotals(s)[0]).toMatchObject({pending:0,used:0,remaining:0,unlinked:0.35});
    expect(lineUse(s.records[0],s).used).toBe(187.33);
  });
  it('does not duplicate rows or linked usage on reimport/reappearance and leaves other scopes untouched',()=>{
    const s=linked(), other={...s.records[0],id:'c',scope:'MED - BAS - Azul',operation:'BAS',location:'Azul'};
    s.records.push(other);s.records=applyIntraSnapshot(s,[],[line.scope],'2026-11-05');
    s.records=applyIntraSnapshot(s,[line,{...line,id:'b',invoice:'0002'}],[line.scope],'2026-11-06');
    expect(s.records).toHaveLength(3);expect(s.records.find(r=>r.id==='a')).toMatchObject({present:true,firstSeen:'2026-11-04',missingSince:null});expect(s.records.find(r=>r.id==='c')).toEqual(other);
    expect(lineUse(s.records[0],s).used).toBe(187.33);
  });
  it('invalidates usage after a changed/undone OK or ambiguous duplicate, without erasing the link history',()=>{
    const s=linked();s.targets=[];
    expect(lineUse(s.records[0],s)).toMatchObject({used:0,remaining:187.33,invalid:true});expect(s.allocations).toHaveLength(2);
    s.targets=[target];s.records[0].duplicate=true;expect(lineUse(s.records[0],s).invalid).toBe(true);
  });
  it('rejects over-allocation, different operations, absent invoices, fuel/material mixing and nonmatching product/invoice',()=>{
    const s=state(),r=s.records[0];
    expect(allocationLimits(s,r,target,187.33)).toBe(true);
    expect(allocationLimits(s,r,target,187.34)).toBe(false);
    expect(allocationLimits(s,r,{...target,operation:'BAS'},1)).toBe(false);
    expect(allocationLimits(s,{...r,present:false},target,1)).toBe(false);
    expect(allocationLimits(s,r,{...target,kind:'MATERIAL'},1)).toBe(false);
    const material={...target,kind:'MATERIAL' as const,description:'Filtro Aceite',invoice:'0009'};
    expect(allocationLimits(s,{...r,fuel:false,product:'Filtro Aire'},material,1)).toBe(false);
    expect(allocationLimits(s,{...r,fuel:false,product:'Filtro Aceite'},material,1)).toBe(false);
  });
  it('only sums fuel in liters and never labels an absent operation as zero stock',()=>{
    const s=state();s.records.push({...s.records[0],id:'oil',fuel:false,product:'Aceite',quantity:200});
    expect(intraFuelTotals(s)).toHaveLength(1);expect(intraFuelTotals(s)[0].pending).toBe(374.66);
    expect(intraFuel('Gasoil Estandar')).toBe(true);expect(intraFuel('Filtro Combustible')).toBe(false);expect(intraFuel('Aceite motor')).toBe(false);
  });
  it('reserves stale target capacity until explicit unlink, even if the source later returns to its previous value',()=>{
    const s=linked();s.targets=[{...target,hash:'z'.repeat(64)}];
    const r={...s.records[0],id:'new',invoice:'new'};s.records.push(r);
    expect(targetAvailable(s,s.targets[0])).toBe(0.35);
    expect(allocationLimits(s,r,s.targets[0],1)).toBe(false);
    s.targets=[target];expect(intraFuelTotals(s)[0].unlinked).toBe(0.35);
    s.allocations[0].active=false;expect(targetAvailable(s,target)).toBe(187.68);
  });
  it('reserves invoice capacity too when a target disappears or its OK is undone',()=>{
    const s=linked();s.targets=[];
    expect(lineUse(s.records[0],s)).toMatchObject({used:0,available:0,invalid:true});
    const other={...target,id:'other',quantity:40};s.targets=[other];
    expect(allocationLimits(s,s.records[0],other,1)).toBe(false);
    s.allocations[0].active=false;expect(allocationLimits(s,s.records[0],other,1)).toBe(true);
  });
  it('does not release a reviewed quantity while identical duplicate source rows are ambiguous',()=>{
    const s=linked();s.records[0].duplicate=true;
    expect(lineUse(s.records[0],s)).toMatchObject({used:0,available:0,invalid:true});
    expect(targetAvailable(s,target)).toBe(0.35);
  });
});
