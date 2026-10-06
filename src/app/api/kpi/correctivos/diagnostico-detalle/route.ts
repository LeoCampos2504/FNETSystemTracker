import { NextResponse } from "next/server";
import { getCorrectiveDiagnosticDetail } from "@/server/services/corrective-diagnostic-detail";
import { requireGlobalDataSession } from "@/server/operations-http";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await requireGlobalDataSession();
  if (!authorization.ok) return authorization.response;
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  try {
    return NextResponse.json(await getCorrectiveDiagnosticDetail());
  } catch {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }
}
