import { NextResponse } from "next/server";
import { databaseIsConfigured } from "@/server/services/database-availability";
import { getTechnicianKpiData } from "@/server/services/technician-kpi";
import { requireGlobalDataSession } from "@/server/operations-http";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await requireGlobalDataSession();
  if (!authorization.ok) return authorization.response;
  if (!databaseIsConfigured()) return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  try {
    return NextResponse.json(await getTechnicianKpiData(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
