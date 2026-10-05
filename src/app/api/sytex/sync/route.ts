import { NextRequest, NextResponse } from "next/server";
import { requireOperationsSession } from "@/server/operations-http";
import { hasAllowedRequestOrigin } from "@/server/request-origin";
import { startSytexSync, sytexSyncStatus } from "@/server/services/sytex-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const authorization = await requireOperationsSession();
  if (!authorization.ok) return authorization.response;
  return NextResponse.json(sytexSyncStatus(), { headers });
}

export async function POST(request: NextRequest) {
  const authorization = await requireOperationsSession();
  if (!authorization.ok) return authorization.response;
  if (!hasAllowedRequestOrigin(request)) return NextResponse.json({ code: "INVALID_ORIGIN" }, { status: 403, headers });
  return NextResponse.json(startSytexSync(authorization.actor.user.id), { headers });
}
