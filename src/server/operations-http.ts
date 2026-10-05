import { NextResponse } from 'next/server';
import { getCurrentSessionUser } from '@/server/services/auth-sessions';
import { operationsActor } from '@/server/services/operations';
import { supplyFailure } from '@/server/supply-http';
export async function requireOperationsSession(){
  try{const user=await getCurrentSessionUser();if(!user)return {ok:false as const,response:NextResponse.json({code:'UNAUTHENTICATED'},{status:401,headers:{'Cache-Control':'no-store'}})};
    return {ok:true as const,actor:await operationsActor(user)};
  }catch(e){return {ok:false as const,response:supplyFailure(e)};}
}
