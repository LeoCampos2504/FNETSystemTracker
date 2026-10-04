import { NextRequest, NextResponse } from "next/server";
import { databaseIsConfigured } from "@/server/services/database-availability";
import { getFuelData } from "@/server/services/operational-data";
import { requireAdminSession } from "@/server/services/auth-sessions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  if (!databaseIsConfigured()) return NextResponse.json({ code: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  const params = request.nextUrl.searchParams;
  try {
    return NextResponse.json(await getFuelData({
      from: params.get("from") ?? undefined, to: params.get("to") ?? undefined,
      site: params.get("site") ?? undefined, origin: params.get("origin") ?? undefined,
      fuel: params.get("fuel") ?? undefined, formulario: params.get("formulario") ?? undefined,
    }), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
