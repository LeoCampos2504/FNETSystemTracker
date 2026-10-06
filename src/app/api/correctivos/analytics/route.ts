import { NextResponse } from "next/server";
import { databaseIsConfigured } from "@/server/services/database-availability";
import { getCorrectiveAnalytics } from "@/server/services/corrective-analytics";
import { requireGlobalDataSession } from "@/server/operations-http";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await requireGlobalDataSession();
  if (!authorization.ok) return authorization.response;
  if (!databaseIsConfigured()) return NextResponse.json({ code: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  try {
    return NextResponse.json(await getCorrectiveAnalytics(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
