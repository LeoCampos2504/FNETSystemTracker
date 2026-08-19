import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { parseOrThrow } from "@/server/http/validate";
import { assignGuardBodySchema } from "@/server/validation/guard.schema";
import { requireCoordinatorOrAdmin, requireSession, requireZoneAccess } from "@/server/http/auth-guards";
import { assignGuardTechnicians, getGuardById } from "@/server/services/guard.service";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    requireCoordinatorOrAdmin(session);
    const { id } = await params;

    const existing = await getGuardById(id);
    if (session.role === UserRole.COORDINATOR) await requireZoneAccess(session, existing.zoneId);

    const body = parseOrThrow(assignGuardBodySchema, await request.json().catch(() => ({})));
    const updated = await assignGuardTechnicians(session.sub, id, body.technicianIds);
    return NextResponse.json(updated);
  });
}
