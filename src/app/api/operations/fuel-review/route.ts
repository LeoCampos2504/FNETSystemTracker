import { NextResponse } from "next/server";
import { requireOperationsSession } from "@/server/operations-http";
import { privateHeaders, readInput, supplyFailure } from "@/server/supply-http";
import { fuelReviewInput, saveFuelReview } from "@/server/services/fuel-review";
import { siteControl } from "@/server/services/site-control";

export async function POST(request:Request) {
  const session=await requireOperationsSession();
  if (!session.ok) return session.response;
  try {
    const input=await readInput(request,fuelReviewInput);
    const result=await saveFuelReview(session.actor,input,async()=>(await siteControl(session.actor)).fuel);
    return NextResponse.json(result,{headers:privateHeaders});
  } catch(error) { return supplyFailure(error); }
}
