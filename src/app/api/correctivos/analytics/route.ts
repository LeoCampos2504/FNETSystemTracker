import { NextResponse } from "next/server";
import { databaseIsConfigured } from "@/server/services/database-availability";
import { getCorrectiveAnalytics } from "@/server/services/corrective-analytics";
import { requireAdminSession } from "@/server/services/auth-sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  if (!databaseIsConfigured()) return NextResponse.json({ code: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  try {
    return NextResponse.json(await getCorrectiveAnalytics(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
