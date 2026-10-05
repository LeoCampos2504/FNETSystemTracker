import { afterAll,beforeAll,describe,it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
let db;
const actor='00000000-0000-4000-8000-000000000001';
beforeAll(async()=>{db=new PGlite();await db.exec('CREATE TABLE app_users(id UUID PRIMARY KEY);');await db.query('INSERT INTO app_users VALUES ($1)',[actor]);await db.exec(readFileSync('prisma/migrations/20261005_add_coordinator_operations/migration.sql','utf8'));},20000);
afterAll(async()=>{await db?.close();});
describe('operations PostgreSQL constraints',()=>{
 it('creates only the seven application-owned tables',async()=>{const r=await db.query("SELECT count(*)::int AS total FROM information_schema.tables WHERE table_name LIKE 'ops_%'");expect(r.rows[0].total).toBe(7);});
 it('stores favorites independently for each account',async()=>{await db.query("INSERT INTO ops_preferences(user_id,favorites) VALUES ($1,$2::jsonb)",[actor,JSON.stringify([{name:'Mis zonas',projects:['NON','BAM']}])]);expect((await db.query('SELECT favorites FROM ops_preferences WHERE user_id=$1',[actor])).rows[0].favorites[0].projects).toEqual(['NON','BAM']);});
 it('rejects negative counted quantities and invalid statuses',async()=>{await db.query("INSERT INTO ops_supply_reviews(source_key,project,source_hash,updated_by) VALUES ('FO-key','NON','hash',$1)",[actor]);await expect(db.query("UPDATE ops_supply_reviews SET counted_quantity=-1 WHERE source_key='FO-key'")).rejects.toThrow();await expect(db.query("UPDATE ops_supply_reviews SET intra_status='inventado' WHERE source_key='FO-key'")).rejects.toThrow();});
 it('only one writer can update a review version',async()=>{const sql="UPDATE ops_supply_reviews SET version=version+1 WHERE source_key='FO-key' AND version=0 RETURNING source_key";expect((await db.query(sql)).rows).toHaveLength(1);expect((await db.query(sql)).rows).toHaveLength(0);});
});
