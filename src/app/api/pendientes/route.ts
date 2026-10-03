import { NextRequest, NextResponse } from "next/server";
import { databaseIsConfigured } from "@/server/services/database-availability";
import { getPendingData } from "@/server/services/operational-data";
import { requireAdminSession } from "@/server/services/auth-sessions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  if (!databaseIsConfigured()) return NextResponse.json({ code: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  const params = request.nextUrl.searchParams;
  try {
    return NextResponse.json(await getPendingData({
      site: params.get("site") ?? undefined, origin: params.get("origin") ?? undefined,
      formulario: params.get("formulario") ?? undefined, pendingStatus: params.get("status") ?? undefined,
    }), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
