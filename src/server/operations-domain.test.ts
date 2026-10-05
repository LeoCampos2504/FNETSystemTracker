import { describe,it,expect } from 'vitest';
import { materialAlert,mergeMaterials,projectKey,selectProjects,sourceHash,sourceIdentity,safeImage } from './operations-domain';
import { daySchema,inputSchema } from './operations-input';
import { operationalWorkbook } from './operations-xlsx';
import { unzipSync,strFromU8 } from 'fflate';
import type { SourceMaterial,MaterialReview } from '@/contracts/operations';
const row:SourceMaterial={key:sourceIdentity('FO-26-1','[#1] Insumo','1.24A'),formulario:'FO-26-1',group:'[#1] Insumo',index:'1.24A',description:'Cable',quantity:'2',siteCode:'ST1',siteName:'Sitio',technician:'Técnico',image:null,imageDeclared:false,projects:['NON'],source:'Sytex · n8n',syncedAt:'2026-09-17T00:00:00.000Z',hash:'hash'};
const review:MaterialReview={project:'NON',classification:'INCLUIDO',intraStatus:'DESCARGADO',invoiceNumber:'',countedQuantity:'2',intraQuantity:'2',notes:'',version:1,sourceHash:'hash',updatedAt:'',updatedBy:''};
describe('control de insumos',()=>{
 it('does not add quantities of repeated synchronizations',()=>{expect(mergeMaterials([row,{...row,quantity:'3',syncedAt:'2026-10-04T00:00:00.000Z'}])).toMatchObject([{quantity:'3'}]);});
 it('preserves two different groups and indices even with identical materials',()=>{expect(mergeMaterials([row,{...row,key:sourceIdentity('FO-26-1','[#2] Insumo','1.24B')}])).toHaveLength(2);});
 it('flags changed sources and partial quantities for review',()=>{expect(materialAlert({...row,review,changed:false}).missing).toBe(false);expect(materialAlert({...row,review,changed:true}).missing).toBe(true);expect(materialAlert({...row,review:{...review,intraQuantity:'1'},changed:false})).toEqual({missing:true,difference:1});});
 it('cannot infer inclusion before classification',()=>{expect(materialAlert({...row,review:{...review,classification:'PENDIENTE'},changed:false}).missing).toBe(true);});
 it('uses normalized quantities for change detection',()=>{expect(sourceHash(row)).toBe(sourceHash({...row,quantity:'2.000'}));expect(sourceHash(row)).not.toBe(sourceHash({...row,quantity:'3'}));});
 it('rejects unapproved project filters and non-photo answers',()=>{expect(()=>selectProjects(['BAM'],['NON'])).toThrow('FORBIDDEN_PROJECT');expect(projectKey('NON - Mantenimiento')).toBe('NON');expect(safeImage('OK')).toBeNull();expect(safeImage('javascript:alert(1)')).toBeNull();});
 it('rejects invalid dates and extra input fields',()=>{expect(daySchema.safeParse('2026-02-30').success).toBe(false);expect(inputSchema.safeParse({action:'favorite',name:'Mis zonas',projects:['NON'],role:'ADMIN'}).success).toBe(false);});
 it('exports actual XLSX without executing spreadsheet formulas',()=>{const files=unzipSync(operationalWorkbook([{name:'Insumos',rows:[['Material','Cantidad'],['=HYPERLINK("bad")',2]]}]));const xml=strFromU8(files['xl/worksheets/sheet1.xml']);expect(xml).toContain('inlineStr');expect(xml).not.toContain('<f>');expect(files['[Content_Types].xml']).toBeDefined();});
});
