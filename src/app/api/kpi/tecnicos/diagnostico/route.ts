import { NextResponse } from "next/server";
import { getTechnicianDiagnostic } from "@/server/services/technician-diagnostic";
import { requireGlobalDataSession } from "@/server/operations-http";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await requireGlobalDataSession();
  if (!authorization.ok) return authorization.response;
  try {
    return NextResponse.json(await getTechnicianDiagnostic());
  } catch {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }
}
