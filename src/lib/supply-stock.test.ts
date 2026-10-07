import { describe, expect, it } from 'vitest';
import type { Material } from '@/contracts/operations';
import { inStock, principalTechnician, stockByTechnician, supplyCounts, supplyMonth } from './supply-stock';

const item=(over:Partial<Material>&{classification?:string;intraStatus?:string}={}):Material=>{
  const {classification='NO_INCLUIDO',intraStatus='NO_CORRESPONDE',...rest}=over;
  return {key:Math.random().toString(),formulario:'FO-26-1',group:'[#1] Insumo',index:'1.1A',description:'Cable',quantity:'2',siteCode:'ST1',siteName:'Sitio',technician:'Ana Pérez / Luis Gómez',image:null,imageDeclared:false,projects:['NON'],source:'Export Sytex',syncedAt:'2026-10-05T00:00:00.000Z',hash:'h',review:{project:'NON',classification,intraStatus,invoiceNumber:'',countedQuantity:null,intraQuantity:null,notes:'',version:1,sourceHash:'h',updatedAt:'',updatedBy:''},files:[],changed:false,missing:false,difference:null,...rest} as Material;
};
describe('technician stock',()=>{
  it('takes the first technician of the form as the main one',()=>{
    expect(principalTechnician('Ana Pérez / Luis Gómez')).toBe('Ana Pérez');
    expect(principalTechnician('Ana Pérez')).toBe('Ana Pérez');
    expect(principalTechnician('')).toBe('Sin técnico asignado');
  });
  it('only counts insumos marked as not included and kept out of Intra',()=>{
    expect(inStock(item())).toBe(true);
    expect(inStock(item({classification:'INCLUIDO',intraStatus:'DESCARGADO'}))).toBe(false);
    expect(inStock(item({classification:'PENDIENTE',intraStatus:'PENDIENTE'}))).toBe(false);
    expect(inStock({review:null})).toBe(false);
  });
  it('groups the stock by main technician and totals each insumo',()=>{
    const groups=stockByTechnician([
      item({description:'Cable',quantity:'2'}),item({description:' cable ',quantity:'3'}),item({description:'Ficha RJ45',quantity:null}),
      item({technician:'Luis Gómez',description:'Llave térmica',quantity:'1'}),item({classification:'INCLUIDO',intraStatus:'DESCARGADO'}),
    ]);
    expect(groups.map(g=>g.technician)).toEqual(['Ana Pérez','Luis Gómez']);
    expect(groups[0].lines).toHaveLength(3);
    expect(groups[0].totals).toEqual([{description:'Cable',quantity:5},{description:'Ficha RJ45',quantity:1}]);
    expect(groups[1].totals).toEqual([{description:'Llave térmica',quantity:1}]);
  });
});

describe('supply control counters',()=>{
  const rows=[
    item({classification:'PENDIENTE',intraStatus:'PENDIENTE',missing:true}),
    item({review:null,missing:true}),
    item({classification:'INCLUIDO',intraStatus:'PENDIENTE',missing:true}),
    item({classification:'INCLUIDO',intraStatus:'DESCARGADO',missing:false}),
    item({classification:'INCLUIDO',intraStatus:'DESCARGADO',missing:false}),
    item({classification:'NO_INCLUIDO',intraStatus:'NO_CORRESPONDE',missing:false}),
    item({classification:'INCLUIDO',intraStatus:'DESCARGADO',missing:true,changed:true}),
  ];
  it('counts by classification, so defining an insumo moves it between cards',()=>{
    expect(supplyCounts(rows)).toEqual({all:7,undefined:2,toDownload:2,downloaded:2,notIncluded:1,changed:1});
    const defined=[...rows];defined[0]=item({classification:'INCLUIDO',intraStatus:'DESCARGADO',missing:false});
    expect(supplyCounts(defined)).toMatchObject({undefined:1,downloaded:3});
  });
  it('takes the month from the shown date and falls back to the sync date',()=>{
    expect(supplyMonth({editedAt:'2026-09-30T23:10:00Z',syncedAt:'2026-10-05T00:00:00.000Z'})).toBe('2026-09');
    expect(supplyMonth({editedAt:null,syncedAt:'2026-10-05T00:00:00.000Z'})).toBe('2026-10');
  });
});
