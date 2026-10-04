import { NextResponse } from "next/server";
import { databaseIsConfigured } from "@/server/services/database-availability";
import { getSyncedData } from "@/server/services/synced-data";
import { requireAdminSession } from "@/server/services/auth-sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  if (!databaseIsConfigured()) return NextResponse.json({ code: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  try { const data = await getSyncedData(); return NextResponse.json({ source: data.source, count: data.counts.correctivos, items: data.tasks.filter((task) => task.type === "CORRECTIVE") }, { headers: { "Cache-Control": "no-store" } }); } catch { return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503 }); }
}
