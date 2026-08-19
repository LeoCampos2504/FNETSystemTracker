import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { parseOrThrow } from "@/server/http/validate";
import { updateGuardBodySchema } from "@/server/validation/guard.schema";
import { requireCoordinatorOrAdmin, requireSession, requireZoneAccess } from "@/server/http/auth-guards";
import { forbidden } from "@/server/http/errors";
import { getGuardById, updateGuard } from "@/server/services/guard.service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    const { id } = await params;
    const guard = await getGuardById(id);

    if (session.role === UserRole.TECHNICIAN) {
      if (!session.technicianId || !guard.technicianIds.includes(session.technicianId)) {
        throw forbidden("You do not have access to this guard");
      }
    } else if (session.role === UserRole.COORDINATOR) {
      await requireZoneAccess(session, guard.zoneId);
    }

    return NextResponse.json(guard);
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    requireCoordinatorOrAdmin(session);
    const { id } = await params;

    const existing = await getGuardById(id);
    if (session.role === UserRole.COORDINATOR) await requireZoneAccess(session, existing.zoneId);

    const body = parseOrThrow(updateGuardBodySchema, await request.json().catch(() => ({})));
    if (session.role === UserRole.COORDINATOR && body.zoneId) {
      await requireZoneAccess(session, body.zoneId);
    }

    const updated = await updateGuard(session.sub, id, body);
    return NextResponse.json(updated);
  });
}
