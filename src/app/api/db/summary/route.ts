import { NextResponse } from "next/server";
import { databaseIsConfigured } from "@/server/services/database-availability";
import { getSyncedCounts } from "@/server/services/synced-data";
import { requireAdminSession } from "@/server/services/auth-sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  if (!databaseIsConfigured()) {
    return NextResponse.json({ code: "DATABASE_NOT_CONFIGURED", message: "DATABASE_URL no está configurada en el servidor." }, { status: 503 });
  }
  try {
    return NextResponse.json({ source: "postgresql", counts: await getSyncedCounts() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE", message: "No fue posible consultar PostgreSQL." }, { status: 503 });
  }
}
