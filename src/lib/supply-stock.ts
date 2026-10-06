import type { Material } from '@/contracts/operations';

/** A not-included insumo is not downloaded in Intra: it stays in the stock of the technician who bought it. */
export const inStock=(item:Pick<Material,'review'>)=>item.review?.classification==='NO_INCLUIDO'&&item.review.intraStatus==='NO_CORRESPONDE';
/** The first technician of the form is the main one, the one who buys. */
export const principalTechnician=(technician:string)=>technician.split(/\s*[/;]\s*/)[0]?.trim()||'Sin técnico asignado';
const fold=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
export type StockGroup={technician:string;lines:Material[];totals:{description:string;quantity:number}[]};

/** Stock per main technician, with the total of each insumo (a line without quantity counts as one unit). */
export function stockByTechnician(items:Material[]):StockGroup[]{
  const groups=new Map<string,{technician:string;lines:Material[]}>();
  for(const item of items.filter(inStock)){
    const technician=principalTechnician(item.technician),key=fold(technician),group=groups.get(key)??{technician,lines:[]};
    group.lines.push(item);groups.set(key,group);
  }
  return [...groups.values()].map(({technician,lines})=>{
    const totals=new Map<string,{description:string;quantity:number}>();
    for(const line of lines){const key=fold(line.description),total=totals.get(key)??{description:line.description,quantity:0};total.quantity=Math.round((total.quantity+(line.quantity===null?1:Number(line.quantity)))*1000)/1000;totals.set(key,total);}
    return {technician,lines:[...lines].sort((a,b)=>(b.editedAt??'').localeCompare(a.editedAt??'')),totals:[...totals.values()].sort((a,b)=>a.description.localeCompare(b.description,'es'))};
  }).sort((a,b)=>a.technician.localeCompare(b.technician,'es'));
}
