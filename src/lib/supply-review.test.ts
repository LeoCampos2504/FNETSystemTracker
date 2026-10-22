import { describe, it, expect } from 'vitest';
import type { Material } from '@/contracts/operations';
import { materialProject, selectedSupplies, supplyReviewInput } from './supply-review';
const item = { key:'example', projects:['Zona de prueba'], quantity:'2.500', hash:'a'.repeat(64), review:null, files:[] } as unknown as Material;
describe('fast supply review inputs',()=>{
  it('uses the own quantity and optimistic snapshot for each supply',()=>{
    expect(supplyReviewInput(item,'INCLUIDO',true,' F-001 ')).toMatchObject({countedQuantity:'2.500',intraQuantity:'2.500',invoiceNumber:'F-001',version:0,sourceHash:item.hash,intraStatus:'DESCARGADO'});
    expect(supplyReviewInput({...item,quantity:'12'},'INCLUIDO',true,'F-001').intraQuantity).toBe('12');
  });
  it('never marks undefined or not included materials as downloaded',()=>{
    expect(supplyReviewInput(item,'PENDIENTE',true,'F-001')).toMatchObject({classification:'PENDIENTE',intraStatus:'PENDIENTE',invoiceNumber:'F-001'});
    expect(supplyReviewInput(item,'NO_INCLUIDO',true,'F-001').intraStatus).toBe('NO_CORRESPONDE');
    expect(supplyReviewInput(item,'INCLUIDO',false,'F-001').intraStatus).toBe('PENDIENTE');
  });
  it('requires an invoice and does not invent zero quantities',()=>{
    expect(()=>supplyReviewInput(item,'INCLUIDO',true,' ')).toThrow('factura');
    expect(()=>supplyReviewInput({...item,quantity:null},'INCLUIDO',true,'F')).toThrow('cantidad');
  });
  it('preserves notes, old version and selected project',()=>{
    const saved={...item,review:{notes:'Nota existente',version:4,project:'Proyecto previo',countedQuantity:'1'}} as Material;
    expect(supplyReviewInput(saved,'INCLUIDO',false,'F')).toMatchObject({notes:'Nota existente',version:4,project:'Proyecto previo',countedQuantity:'1'});
  });
  it('refuses ambiguous projects and ignores hidden selections',()=>{
    expect(materialProject({...item,projects:['A','B']})).toBe('');
    expect(()=>supplyReviewInput({...item,projects:[]},'PENDIENTE',false,'')).toThrow('proyecto');
    expect(selectedSupplies([item],['hidden',item.key])).toEqual([item]);
  });
});
