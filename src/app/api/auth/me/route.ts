import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/server/http/respond";
import { getSessionFromRequest } from "@/server/auth/session";
import { getUserById } from "@/server/services/auth.service";

/**
 * Matches `Api.getCurrentUser(): Promise<User | null>` exactly: "not logged
 * in" is a normal `null` result, never a 401 — http-api.ts's generic
 * `request()` throws on any non-2xx, which would break that contract.
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const session = await getSessionFromRequest(request);
    if (!session) return NextResponse.json(null);
    const user = await getUserById(session.sub);
    return NextResponse.json(user);
  });
}
