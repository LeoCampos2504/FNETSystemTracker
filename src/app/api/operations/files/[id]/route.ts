import { NextResponse } from 'next/server';
import { requireOperationsSession } from '@/server/operations-http';
import { materials } from '@/server/services/operations';
import { getPrismaClient } from '@/server/prisma';
import { privateHeaders,supplyFailure } from '@/server/supply-http';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const a=await requireOperationsSession();if(!a.ok)return a.response;
 try{const {id}=await params;if(!/^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({code:'NOT_FOUND'},{status:404});
 const allowed=(await materials(a.actor)).some(r=>r.files.some(f=>f.id===id));if(!allowed)return NextResponse.json({code:'NOT_FOUND'},{status:404});
 const [file]=await getPrismaClient().$queryRaw<{content:Uint8Array;mime_type:string;file_name:string}[]>`SELECT content,mime_type,file_name FROM ops_review_files WHERE id=${id}::uuid`;
 if(!file)return NextResponse.json({code:'NOT_FOUND'},{status:404});return new NextResponse(new Uint8Array(file.content),{headers:{...privateHeaders,'Content-Type':file.mime_type,'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,'Content-Security-Policy':"default-src 'none'; sandbox"}});
 }catch(e){return supplyFailure(e);}}
