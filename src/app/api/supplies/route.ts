import { NextResponse } from "next/server";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { privateHeaders, supplyFailure } from "@/server/supply-http";

import { overview } from "@/server/services/supply-control";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try { 
    return NextResponse.json(await overview(new URL(request.url).searchParams), { headers: privateHeaders });
  } catch (error) { return supplyFailure(error); }
}
