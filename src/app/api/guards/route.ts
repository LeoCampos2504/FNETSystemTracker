import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { parseOrThrow, searchParamsToObject } from "@/server/http/validate";
import { createGuardBodySchema, guardListQuerySchema } from "@/server/validation/guard.schema";
import { requireCoordinatorOrAdmin, requireSession, requireZoneAccess } from "@/server/http/auth-guards";
import { resolveScope } from "@/server/http/scope";
import { createGuard, listGuards } from "@/server/services/guard.service";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    const query = parseOrThrow(guardListQuerySchema, searchParamsToObject(request.nextUrl.searchParams));
    const scope = await resolveScope(session, query);

    const guards = await listGuards({ technicianId: scope.technicianId, zoneIds: scope.zoneIds });
    return NextResponse.json(guards);
  });
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    requireCoordinatorOrAdmin(session);

    const body = parseOrThrow(createGuardBodySchema, await request.json().catch(() => ({})));
    if (session.role === UserRole.COORDINATOR) await requireZoneAccess(session, body.zoneId);

    const guard = await createGuard(session.sub, body);
    return NextResponse.json(guard, { status: 201 });
  });
}
