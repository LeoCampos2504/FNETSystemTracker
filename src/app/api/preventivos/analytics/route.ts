import { NextResponse } from "next/server";
import { databaseIsConfigured } from "@/server/services/database-availability";
import { getPreventiveAnalytics } from "@/server/services/preventive-analytics";
import { requireGlobalDataSession } from "@/server/operations-http";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await requireGlobalDataSession();
  if (!authorization.ok) return authorization.response;
  if (!databaseIsConfigured()) return NextResponse.json({ code: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  try {
    return NextResponse.json(await getPreventiveAnalytics(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
