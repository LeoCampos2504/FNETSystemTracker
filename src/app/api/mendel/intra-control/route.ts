import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/server/services/auth-sessions';
import { getPrismaClient } from '@/server/prisma';
import { privateHeaders, readInput, supplyFailure } from '@/server/supply-http';
import { intraTransactionId, mendelIntraInput } from '@/server/mendel-intra-input';
import { confirmIntra, intraOverview, MendelIntraError, type IntraDb } from '@/server/services/mendel-intra-control';

export const dynamic = 'force-dynamic';
type Raw = { $queryRawUnsafe<T>(sql:string,...values:unknown[]):Promise<T> };
const intraRunner = (client:Raw):IntraDb => ({query:<T>(sql:string,values:unknown[]=[])=>client.$queryRawUnsafe<T[]>(sql,...values)});
function failure(error:unknown) {
  if (error instanceof MendelIntraError) return NextResponse.json({code:error.code},{status:error.status,headers:privateHeaders});
  return supplyFailure(error);
}
export async function GET(request:Request) {
  const auth=await requireAdminSession(); if(!auth.ok)return auth.response;
  try {
    const id=intraTransactionId.parse(new URL(request.url).searchParams.get('transactionId'));
    const result=await getPrismaClient().$transaction(tx=>intraOverview(intraRunner(tx),auth.user,id));
    return NextResponse.json(result,{headers:privateHeaders});
  }catch(error){return failure(error);}
}
export async function POST(request:Request) {
  const auth=await requireAdminSession(); if(!auth.ok)return auth.response;
  try {
    const input=await readInput(request,mendelIntraInput);
    const result=await getPrismaClient().$transaction(tx=>confirmIntra(intraRunner(tx),auth.user,input));
    return NextResponse.json(result,{headers:privateHeaders});
  }catch(error){return failure(error);}
}
