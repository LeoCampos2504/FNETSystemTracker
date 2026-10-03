import { NextResponse } from "next/server";
import { getTechnicianDiagnostic } from "@/server/services/technician-diagnostic";
import { requireAdminSession } from "@/server/services/auth-sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try {
    return NextResponse.json(await getTechnicianDiagnostic());
  } catch {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }
}
