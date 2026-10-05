import { describe,it,expect } from 'vitest';
import { groupMaterials,materialAlert,mergeMaterials,projectKey,selectProjects,sourceHash,sourceIdentity,safeImage } from './operations-domain';
import { daySchema,inputSchema } from './operations-input';
import { operationalWorkbook } from './operations-xlsx';
import { unzipSync,strFromU8 } from 'fflate';
import type { SourceMaterial,MaterialReview } from '@/contracts/operations';
const row:SourceMaterial={key:sourceIdentity('FO-26-1','[#1] Insumo','1.24A'),formulario:'FO-26-1',group:'[#1] Insumo',index:'1.24A',description:'Cable',quantity:'2',siteCode:'ST1',siteName:'Sitio',technician:'Técnico',image:null,imageDeclared:false,projects:['NON'],source:'Sytex · n8n',syncedAt:'2026-09-17T00:00:00.000Z',hash:'hash'};
const review:MaterialReview={project:'NON',classification:'INCLUIDO',intraStatus:'DESCARGADO',invoiceNumber:'',countedQuantity:'2',intraQuantity:'2',notes:'',version:1,sourceHash:'hash',updatedAt:'',updatedBy:''};
describe('control de insumos',()=>{
 it('groups the same insumo repeated in one form into one row with the total quantity',()=>{
  const line=(group:string,over:Partial<SourceMaterial>={})=>({...row,key:sourceIdentity('FO-26-1',group,'1.1'),group,description:'Llave térmica de C63',quantity:'1',provider:'Stock Claro',siteCode:'ST00122',...over});
  const rows=groupMaterials([line('[#3] Insumo'),line('[#1] Insumo'),line('[#2] Insumo',{description:'  LLAVE térmica de c63 '}),line('[#4] Insumo',{description:'Cable'}),line('[#5] Insumo',{provider:'Compra propia'}),{...line('[#1] Insumo'),formulario:'FO-26-2',key:sourceIdentity('FO-26-2','[#1] Insumo','1.1')}]);
  expect(rows).toHaveLength(5);
  const grouped=rows.find(r=>r.formulario==='FO-26-1'&&r.description==='Llave térmica de C63'&&r.provider==='Stock Claro')!;
  expect(grouped).toMatchObject({quantity:'3',lines:3,key:sourceIdentity('FO-26-1','[#1] Insumo','1.1')});
  expect(grouped.hash).toBe(sourceHash({...grouped,quantity:'3'}));
  expect(rows.filter(r=>r.lines===1)).toHaveLength(4);
 });
 it('counts repeated lines without quantity as one unit each and leaves a single line as it is',()=>{
  const line=(group:string,quantity:string|null)=>({...row,key:sourceIdentity('FO-26-1',group,'1'),group,description:'Ficha rj45',quantity});
  expect(groupMaterials([line('[#1]',null),line('[#2]',null)])).toMatchObject([{quantity:'2',lines:2}]);
  expect(groupMaterials([line('[#1]',null)])).toMatchObject([{quantity:null,lines:1}]);
  expect(groupMaterials([line('[#1]','2.5'),line('[#2]',null)])).toMatchObject([{quantity:'3.5',lines:2}]);
 });
 it('does not add quantities of repeated synchronizations',()=>{expect(mergeMaterials([row,{...row,quantity:'3',syncedAt:'2026-10-04T00:00:00.000Z'}])).toMatchObject([{quantity:'3'}]);});
 it('preserves two different groups and indices even with identical materials',()=>{expect(mergeMaterials([row,{...row,key:sourceIdentity('FO-26-1','[#2] Insumo','1.24B')}])).toHaveLength(2);});
 it('flags changed sources and partial quantities for review',()=>{expect(materialAlert({...row,review,changed:false}).missing).toBe(false);expect(materialAlert({...row,review,changed:true}).missing).toBe(true);expect(materialAlert({...row,review:{...review,intraQuantity:'1'},changed:false})).toEqual({missing:true,difference:1});});
 it('cannot infer inclusion before classification',()=>{expect(materialAlert({...row,review:{...review,classification:'PENDIENTE'},changed:false}).missing).toBe(true);});
 it('uses normalized quantities for change detection',()=>{expect(sourceHash(row)).toBe(sourceHash({...row,quantity:'2.000'}));expect(sourceHash(row)).not.toBe(sourceHash({...row,quantity:'3'}));});
 it('rejects unapproved project filters and non-photo answers',()=>{expect(()=>selectProjects(['BAM'],['NON'])).toThrow('FORBIDDEN_PROJECT');expect(projectKey('NON - Mantenimiento')).toBe('NON - Mantenimiento');expect(safeImage('OK')).toBeNull();expect(safeImage('javascript:alert(1)')).toBeNull();});
 it('keeps different Sytex projects with the same prefix separate',()=>{expect(projectKey('NON - Civil')).not.toBe(projectKey('NON - Generadores'));expect(projectKey('  CEF -  Aire acondicionado  ')).toBe('CEF - Aire acondicionado');});
 it('rejects invalid dates and extra input fields',()=>{expect(daySchema.safeParse('2026-02-30').success).toBe(false);expect(inputSchema.safeParse({action:'favorite',name:'Mis zonas',projects:['NON'],role:'ADMIN'}).success).toBe(false);});
 it('exports actual XLSX without executing spreadsheet formulas',()=>{const files=unzipSync(operationalWorkbook([{name:'Insumos',rows:[['Material','Cantidad'],['=HYPERLINK("bad")',2]]}]));const xml=strFromU8(files['xl/worksheets/sheet1.xml']);expect(xml).toContain('inlineStr');expect(xml).not.toContain('<f>');expect(files['[Content_Types].xml']).toBeDefined();});
 it('exports clickable https links and ignores any other link',()=>{const files=unzipSync(operationalWorkbook([{name:'Insumos',rows:[['Formulario','Enlace'],['FO-26-1',{text:'FO-26-1',link:'https://claro.sytex.io/forms/1/?a=1&b=2'}],['FO-26-2',{text:'FO-26-2',link:'javascript:alert(1)'}]]}]));const sheet=strFromU8(files['xl/worksheets/sheet1.xml']),rels=strFromU8(files['xl/worksheets/_rels/sheet1.xml.rels']);expect(sheet).toContain('<hyperlink ref="B2" r:id="rId1"/>');expect(sheet).not.toContain('B3" r:id');expect(rels).toContain('Target="https://claro.sytex.io/forms/1/?a=1&amp;b=2" TargetMode="External"');expect(rels).not.toContain('javascript');expect(sheet).toContain('FO-26-2');});
});
