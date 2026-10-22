import {describe,it,expect} from 'vitest';
import {parseTrayCsv,filterTray,EMPTY_TRAY_FILTERS,type TrayRow} from './mendel-bandeja';
import {buildMendelSyncPlan,sameMendelExpense} from './mendel-source-refresh';
import {mendelReceipt} from './mendel-receipt';
const csv='ID transaccion;Fecha;Usuario;Comercio;Total;Moneda;Presupuesto;Notas;Hay ticket;Nombre PDF;Estado comprobacion\nEXAMPLE;19/10/2026;Persona ficticia;Comercio ficticio;29040.00;ARS;CIVIL;Salto Eugenia;NO;example.pdf;FINALIZADA';
const parsed=()=>parseTrayCsv(csv);
describe('CSV source refresh and receipt evidence',()=>{
  it('retains conflicting PDF evidence without claiming missing receipt or official approval',()=>{
    const r=parsed().rows[0];expect(r.documentName).toBe('example.pdf');expect(r.receiptStatus).toBe('FINALIZADA');
    expect(mendelReceipt(r)).toMatchObject({kind:'REVIEW',label:'PDF informado · revisar',missing:false});
    expect(r.officialApproval).toBe('');expect(filterTray([r],{...EMPTY_TRAY_FILTERS,hideSigned:false,receipt:'NO'})).toHaveLength(0);
  });
  it('distinguishes missing, unknown and not-required from a declared receipt',()=>{
    expect(mendelReceipt({receipt:'NO'}).missing).toBe(true);
    expect(mendelReceipt({receipt:'SIN_DATO'})).toMatchObject({kind:'UNKNOWN',missing:false});
    expect(mendelReceipt({receipt:'NO',receiptStatus:'NO REQUIERE'}).missing).toBe(false);
    expect(mendelReceipt({receipt:'SI'}).kind).toBe('TICKET');
    expect(mendelReceipt({receipt:'SI',documentName:'example.pdf'}).kind).toBe('PDF');
  });
  it('updates already shared expenses even when signature or other filters hide them',()=>{
    const current=parsed().rows[0],shared={...current,notes:'Anterior',zone:'A',snapshotHash:'a'.repeat(64)};
    expect(filterTray([current],EMPTY_TRAY_FILTERS)).toHaveLength(0);
    const plan=buildMendelSyncPlan([current],[shared],[],parsed().sourceFields);
    expect(plan.updates).toHaveLength(1);expect(plan.updates[0].patch.notes).toBe('Salto Eugenia');expect(plan.newRows).toEqual([]);
  });
  it('never clears evidence fields absent from the CSV and rejects duplicate IDs',()=>{
    const data=parseTrayCsv('ID transaccion;Fecha;Usuario;Comercio;Total\nEX;19/10/2026;Persona;Tienda;1');
    expect(data.sourceFields).not.toContain('notes');expect(data.sourceFields).not.toContain('documentName');
    expect(()=>buildMendelSyncPlan([parsed().rows[0],parsed().rows[0]],[],[],[])).toThrow('repite');
    expect(()=>buildMendelSyncPlan(parsed().rows,parsed().rows,[],parsed().sourceFields)).toThrow('versión');
  });
  it('shares only new visible rows and requires exact financial/identity matches',()=>{
    const r=parsed().rows[0],shared={...r,snapshotHash:'a'.repeat(64)},fresh={...r,transactionId:'NEW',key:'NEW'} as TrayRow;
    expect(buildMendelSyncPlan([r,fresh],[shared],[r,fresh],parsed().sourceFields).newRows).toEqual([fresh]);
    expect(sameMendelExpense(r,{...r,amount:'29.040,00'})).toBe(true);
    for(const changes of [{amount:'29041'},{person:'Otra persona'},{currency:''},{date:'20/10/2026'},{merchant:'Otra tienda'},{amount:'29.040'}])expect(sameMendelExpense(r,{...r,...changes})).toBe(false);
  });
});
