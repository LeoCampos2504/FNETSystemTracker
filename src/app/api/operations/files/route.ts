import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireOperationsSession } from '@/server/operations-http';
import { audit,materials } from '@/server/services/operations';
import { getPrismaClient } from '@/server/prisma';
import { inspectFile,SupplyError } from '@/server/services/supply-control';
import { hasAllowedRequestOrigin } from '@/server/request-origin';
import { privateHeaders,supplyFailure } from '@/server/supply-http';
export const dynamic='force-dynamic';
export async function POST(request:Request){const a=await requireOperationsSession();if(!a.ok)return a.response;
 try{if(!hasAllowedRequestOrigin(request))throw new SupplyError('INVALID_ORIGIN',403);
 const max=8*1024*1024+65536,reader=request.body?.getReader();if(!reader)throw new SupplyError('INPUT_INVALID',422);
 const chunks:Uint8Array[]=[];let size=0;for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max){await reader.cancel();throw new SupplyError('FILE_TOO_LARGE',413);}chunks.push(r.value);}
 const bounded=new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')??''},body:Buffer.concat(chunks)}),form=await bounded.formData(),key=String(form.get('key')??''),file=form.get('file');
 if(!(file instanceof File))throw new SupplyError('INPUT_INVALID',422);
 const row=(await materials(a.actor)).find(r=>r.key===key);if(!row?.review)throw new SupplyError('SAVE_REVIEW_FIRST',422);
 const bytes=new Uint8Array(await file.arrayBuffer()),meta=inspectFile(bytes,file.name);
 const result=await getPrismaClient().$transaction(async tx=>{
  await tx.$queryRaw`SELECT source_key FROM ops_supply_reviews WHERE source_key=${key} FOR UPDATE`;
  const existing=await tx.$queryRaw<{id:string;file_hash:string;byte_count:number}[]>`SELECT id,file_hash,byte_count FROM ops_review_files WHERE source_key=${key}`;
  const duplicate=existing.find(f=>f.file_hash===meta.fileHash);if(duplicate)return {id:duplicate.id,alreadySaved:true};
  if(existing.length>=6||existing.reduce((t,f)=>t+f.byte_count,0)+bytes.length>24*1024*1024)throw new SupplyError('INVOICE_FILE_LIMIT',422);
  const id=randomUUID();await tx.$executeRaw`INSERT INTO ops_review_files(id,source_key,file_name,mime_type,byte_count,file_hash,content,created_by) VALUES (${id}::uuid,${key},${meta.fileName},${meta.mimeType},${bytes.length},${meta.fileHash},${Buffer.from(bytes)},${a.actor.user.id}::uuid)`;
  await audit(tx,a.actor,key,'INVOICE_FILE_ATTACHED',{id,fileName:meta.fileName});return {id};
 });return NextResponse.json(result,{headers:privateHeaders});}catch(e){return supplyFailure(e);}}
