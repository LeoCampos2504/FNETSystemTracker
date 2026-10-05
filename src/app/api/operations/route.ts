import { NextResponse } from 'next/server';
import { daySchema,inputSchema } from '@/server/operations-input';
import { requireOperationsSession } from '@/server/operations-http';
import { addVisit, catalog, closeDay, deleteReview, history, materials, saveFavorite, saveReview, siteContext, updateVisit, visits } from '@/server/services/operations';
import { privateHeaders, readInput, supplyFailure } from '@/server/supply-http';
export const dynamic='force-dynamic';
export async function GET(request:Request){const a=await requireOperationsSession();if(!a.ok)return a.response;
 try{const p=new URL(request.url).searchParams,selected=p.getAll('project'),kind=p.get('kind');
  const value=kind==='visits'?await visits(a.actor,daySchema.parse(p.get('day')),selected):kind==='materials'?{items:await materials(a.actor,selected)}:kind==='history'?await history(a.actor,selected):kind==='site'?await siteContext(a.actor,(p.get('site')??'').slice(0,200)):await catalog(a.actor);
  return NextResponse.json(value,{headers:privateHeaders});
 }catch(e){return supplyFailure(e);}}
export async function POST(request:Request){const a=await requireOperationsSession();if(!a.ok)return a.response;
 try{const input=await readInput(request,inputSchema);const result=input.action==='favorite'?await saveFavorite(a.actor,input):input.action==='visit'?await addVisit(a.actor,input):input.action==='updateVisit'?await updateVisit(a.actor,input):input.action==='close'?await closeDay(a.actor,input.day,input.projects):input.action==='deleteReview'?await deleteReview(a.actor,input):await saveReview(a.actor,input);
 return NextResponse.json(result,{headers:privateHeaders});}catch(e){return supplyFailure(e);}}
