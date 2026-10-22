import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll,afterAll,beforeEach,describe,it,expect,vi } from 'vitest';
import { UserRole } from '@/contracts';
import { supplyReviewInput } from '@/lib/supply-review';
import { inputSchema } from '@/server/operations-input';
const fake=vi.hoisted(()=>({db:{} as Record<string,unknown>}));
vi.mock('@/server/prisma',()=>({getPrismaClient:()=>fake.db}));
import { materials,saveReviews,type OperationsActor } from './operations';
const actor:OperationsActor={user:{id:'00000000-0000-4000-8000-000000000001',name:'Persona de prueba',email:'test@example.invalid',role:UserRole.ADMIN,active:true,technicianId:null,coordinatorId:null},allowed:null};
let pg:PGlite;
function bridge(client:Pick<PGlite,'query'>){
  const query=(strings:TemplateStringsArray,values:unknown[])=>client.query(strings.reduce((sql,part,i)=>sql+(i?'$'+i:'')+part,''),values);
  return {$queryRaw:async(strings:TemplateStringsArray,...values:unknown[])=>(await query(strings,values)).rows,
    $executeRaw:async(strings:TemplateStringsArray,...values:unknown[])=>(await query(strings,values)).affectedRows};
}
beforeAll(async()=>{
  pg=new PGlite();await pg.exec('CREATE TABLE app_users(id UUID PRIMARY KEY)');
  await pg.query('INSERT INTO app_users VALUES($1)',[actor.user.id]);
  await pg.exec(readFileSync(new URL('../../../prisma/migrations/20261005_add_coordinator_operations/migration.sql',import.meta.url),'utf8'));
},20000);
afterAll(async()=>{await pg?.close();});
beforeEach(async()=>{
  await pg.exec('TRUNCATE ops_events,ops_review_files,ops_supply_reviews');
  const empty={findMany:async()=>[]};
  fake.db={...bridge(pg),$transaction:async(run:(tx:unknown)=>Promise<unknown>)=>pg.transaction(tx=>run(bridge(tx))),
    preventivos:{findMany:async()=>[1,2].map(n=>({codigo:'FO-EX-'+n,proyecto:n===1?'A - mantenimiento':'B - mantenimiento',codigos_sitios_afectados:'EX',nombre:'Prueba'}))},
    correctivos:empty,cotizaciones:empty,sytex_supply_form_contexts:empty,sytex_site_maintenance:empty,sytex_form_states:empty,sytex_form_links:empty,sytex_task_dates:empty,sytex_supply_import_items:empty,
    insumos:{findMany:async()=>[1,2].map(n=>({formulario:'FO-EX-'+n,grupo:'G',indice:'I',descripcion:'Material '+n,cantidad:String(n),sincronizado_el:new Date('2026-10-22')}))}};
});
async function inputs(){return (await materials(actor)).map(row=>supplyReviewInput(row,'INCLUIDO',true,'F-EXAMPLE'));}
describe('atomic bulk supply control, actual SQL on synthetic in-memory data',()=>{
  it('saves the same invoice with each own quantity and author/event',async()=>{
    expect(await saveReviews(actor,await inputs())).toEqual({saved:2});
    const rows=(await pg.query<{invoice_number:string;intra_quantity:string;version:number;updated_by:string}>('SELECT * FROM ops_supply_reviews ORDER BY source_key')).rows;
    expect(rows.map(r=>r.invoice_number)).toEqual(['F-EXAMPLE','F-EXAMPLE']);
    expect(rows.map(r=>Number(r.intra_quantity))).toEqual([1,2]);
    expect(rows.every(r=>r.version===1&&r.updated_by===actor.user.id)).toBe(true);
    expect((await pg.query('SELECT * FROM ops_events')).rows).toHaveLength(2);
  });
  it('rolls back earlier writes and audit events when the last version conflicts',async()=>{
    const rows=(await inputs()).sort((a,b)=>a.key.localeCompare(b.key));rows[1].version=99;
    await expect(saveReviews(actor,rows)).rejects.toThrow('STALE_VERSION');
    expect((await pg.query('SELECT * FROM ops_supply_reviews')).rows).toHaveLength(0);
    expect((await pg.query('SELECT * FROM ops_events')).rows).toHaveLength(0);
  });
  it('rejects one inaccessible source before writing any row',async()=>{
    const rows=await inputs(),restricted={...actor,allowed:['A - mantenimiento']};
    await expect(saveReviews(restricted,rows)).rejects.toThrow('NOT_FOUND');
    expect((await pg.query('SELECT * FROM ops_supply_reviews')).rows).toHaveLength(0);
  });
  it('rejects changed snapshots, repeated keys and a mixed invoice',async()=>{
    const rows=await inputs();
    await expect(saveReviews(actor,[rows[0],{...rows[1],sourceHash:'b'.repeat(64)}])).rejects.toThrow('SOURCE_CHANGED');
    await expect(saveReviews(actor,[rows[0],rows[0]])).rejects.toThrow('INPUT_INVALID');
    expect(inputSchema.safeParse({action:'reviewBatch',reviews:[rows[0],{...rows[1],invoiceNumber:'OTHER'}]}).success).toBe(false);
    expect(inputSchema.safeParse({action:'reviewBatch',reviews:Array.from({length:51},(_,n)=>({...rows[0],key:String(n)}))}).success).toBe(false);
    expect(inputSchema.safeParse({action:'reviewBatch',reviews:[{...rows[0],actorId:actor.user.id}]}).success).toBe(false);
  });
  it('keeps existing notes and attachments when applying a new common invoice',async()=>{
    await saveReviews(actor,(await inputs()).map(r=>({...r,notes:'Nota original'})));
    const [row]=(await inputs());await pg.query("INSERT INTO ops_review_files(id,source_key,file_name,mime_type,byte_count,file_hash,created_by,content) VALUES($1,$2,'test.pdf','application/pdf',1,'hash',$3,decode('00','hex'))",['00000000-0000-4000-8000-000000000002',row.key,actor.user.id]);
    const updated=(await inputs()).map(r=>({...r,invoiceNumber:'F-SECOND'}));
    await saveReviews(actor,updated);
    expect((await pg.query<{notes:string}>('SELECT notes FROM ops_supply_reviews')).rows.every(r=>r.notes==='Nota original')).toBe(true);
    expect((await pg.query('SELECT * FROM ops_review_files')).rows).toHaveLength(1);
  });
});
