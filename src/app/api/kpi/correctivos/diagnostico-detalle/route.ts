import { NextResponse } from "next/server";
import { getCorrectiveDiagnosticDetail } from "@/server/services/corrective-diagnostic-detail";
import { requireAdminSession } from "@/server/services/auth-sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  try {
    return NextResponse.json(await getCorrectiveDiagnosticDetail());
  } catch {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }
}
