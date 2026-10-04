import { NextResponse } from "next/server";
import { UserRole } from "@/contracts";
import { getCurrentSessionUser } from "@/server/services/auth-sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentSessionUser();
    if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    if (user.role !== UserRole.ADMIN) return NextResponse.json({ code: "ROLE_SCOPE_NOT_READY" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "AUTH_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
