import { describe, expect, it, vi } from 'vitest';
vi.mock('@/server/prisma',()=>({getPrismaClient:()=>({})}));
import type { Material, SiteFuelLoad } from '@/contracts/operations';
import { intraTargets } from './intra-stock';
const fuel:SiteFuelLoad={id:'load',formCode:'FO-26-000001',siteCode:'ST00001',siteName:'Prueba',project:'NON - MPC',date:'2026-11-01',liters:40,fuel:'Gasoil',levelBefore:null,levelAfter:null,hourmeter:null,origin:'PREVENTIVO',source:'Sytex',link:null,review:{ok:true,version:1,sourceHash:'a'.repeat(64),updatedAt:null,updatedBy:null}};
const material:Material={key:'item',formulario:'FO-26-000001',group:'Insumos',index:'1',description:'Filtro Combustible',quantity:'2',siteCode:'ST00001',siteName:'Prueba',technician:'Técnico prueba',image:null,imageDeclared:false,projects:['NON - MPC'],source:'Sytex',syncedAt:'2026-11-01',hash:'b'.repeat(64),review:null,files:[],changed:false,missing:false,difference:null};
describe('usage sources for Intra, no invented confirmations',()=>{
 it('offers only current fuel OKs and does not count the same fuel as a generic material',()=>{
  expect(intraTargets([fuel],[{...material,description:'Gasoil Premium',quantity:'40'}])).toHaveLength(1);
  expect(intraTargets([{...fuel,review:{...fuel.review!,ok:false}}],[])).toEqual([]);
  expect(intraTargets([{...fuel,liters:null}],[])).toEqual([]);
 });
 it('keeps fuel filters as ordinary supplies and excludes ambiguous operation/quantity, missing and changed sources',()=>{
  expect(intraTargets([],[material])[0]).toMatchObject({kind:'MATERIAL',operation:'NON',quantity:2,description:'Filtro Combustible'});
  for(const changed of [{changed:true},{missing:true},{quantity:'No informado'},{projects:['NON - MPC','BAS - MPC']}]) expect(intraTargets([],[{...material,...changed}])).toEqual([]);
 });
 it('a new review changes the source fingerprint, so undo/re-OK does not silently restore an old allocation',()=>{
  expect(intraTargets([fuel],[])[0].hash).not.toBe(intraTargets([{...fuel,review:{...fuel.review!,version:3}}],[])[0].hash);
 });
});
