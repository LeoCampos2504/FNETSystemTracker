import { NextResponse } from 'next/server';
import { getCurrentSessionUser } from '@/server/services/auth-sessions';
import { operationsActor } from '@/server/services/operations';
import { supplyFailure } from '@/server/supply-http';
/** CTIC accounts only reach the routes that opt in with allowCtic. */
export async function requireOperationsSession(allowCtic=false){
  try{const user=await getCurrentSessionUser();if(!user)return {ok:false as const,response:NextResponse.json({code:'UNAUTHENTICATED'},{status:401,headers:{'Cache-Control':'no-store'}})};
    const actor=await operationsActor(user);
    if(actor.ctic&&!allowCtic)return {ok:false as const,response:NextResponse.json({code:'FORBIDDEN'},{status:403,headers:{'Cache-Control':'no-store'}})};
    return {ok:true as const,actor};
  }catch(e){return {ok:false as const,response:supplyFailure(e)};}
}

/** Admins and coordination accounts that see every zone read the shared operational data; CTIC and zone-limited accounts do not. */
export async function requireGlobalDataSession(){
  const session=await requireOperationsSession();
  if(!session.ok)return session;
  if(session.actor.allowed!==null)return {ok:false as const,response:NextResponse.json({code:'FORBIDDEN'},{status:403,headers:{'Cache-Control':'no-store'}})};
  return session;
}
