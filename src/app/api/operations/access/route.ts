import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { requireAdminSession } from '@/server/services/auth-sessions';
import { catalog,audit } from '@/server/services/operations';
import { getPrismaClient } from '@/server/prisma';
import { readInput,privateHeaders,supplyFailure } from '@/server/supply-http';
import { SupplyError } from '@/server/services/supply-control';
export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('grant'),userId:z.string().uuid(),projects:z.array(z.string().trim().min(1).max(200)).max(100)}).strict(),
 z.object({action:z.literal('create'),email:z.string().trim().email().max(320).transform(s=>s.toLowerCase()),name:z.string().trim().min(1).max(200),password:z.string().min(15).max(72).refine(s=>Buffer.byteLength(s,'utf8')<=72),projects:z.array(z.string().trim().min(1).max(200)).min(1).max(100)}).strict(),
]);
export async function GET(){const a=await requireAdminSession();if(!a.ok)return a.response;
 try{const db=getPrismaClient(),users=await db.app_users.findMany({where:{role:'COORDINATOR'},select:{id:true,name:true,email:true,active:true}}),grants=await db.$queryRaw<{user_id:string;projects:string[]}[]>`SELECT user_id,projects FROM ops_user_access`;
 return NextResponse.json({users:users.map(u=>({...u,projects:grants.find(g=>g.user_id===u.id)?.projects??[]}))},{headers:privateHeaders});}catch(e){return supplyFailure(e);}}
export async function POST(request:Request){const a=await requireAdminSession();if(!a.ok)return a.response;
 try{const input=await readInput(request,schema),actor={user:a.user,allowed:null},c=await catalog(actor);if(input.projects.some(p=>!c.projects.includes(p)))throw new SupplyError('FORBIDDEN_PROJECT',403);
 const passwordHash=input.action==='create'?await hash(input.password,12):null;
 await getPrismaClient().$transaction(async tx=>{
   const user=input.action==='create'?await tx.app_users.create({data:{email:input.email,name:input.name,passwordHash:passwordHash!,role:'COORDINATOR'},select:{id:true}}):await tx.app_users.findFirst({where:{id:input.userId,role:'COORDINATOR'},select:{id:true}});
   if(!user)throw new SupplyError('NOT_FOUND',404);
   await tx.$executeRaw`INSERT INTO ops_user_access(user_id,projects,updated_by) VALUES (${user.id}::uuid,${JSON.stringify([...new Set(input.projects)])}::jsonb,${a.user.id}::uuid) ON CONFLICT(user_id) DO UPDATE SET projects=EXCLUDED.projects,updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP`;
   await audit(tx,actor,user.id,'COORDINATOR_ACCESS_UPDATED',{projects:input.projects});
 });return NextResponse.json({saved:true},{headers:privateHeaders});}catch(e){return supplyFailure(e);}}
