import { NextResponse } from "next/server";
import { databaseIsConfigured } from "@/server/services/database-availability";
import { getTechnicianKpiData } from "@/server/services/technician-kpi";
import { requireAdminSession } from "@/server/services/auth-sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  if (!databaseIsConfigured()) return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  try {
    return NextResponse.json(await getTechnicianKpiData(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
