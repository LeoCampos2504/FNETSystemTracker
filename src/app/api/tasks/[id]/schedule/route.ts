import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { parseOrThrow } from "@/server/http/validate";
import { scheduleTaskBodySchema } from "@/server/validation/task.schema";
import { requireCoordinatorOrAdmin, requireSession, requireZoneAccess } from "@/server/http/auth-guards";
import { getTaskById, scheduleTask } from "@/server/services/task.service";

/**
 * Also serves "reprogramar": scheduling an already-scheduled task again with
 * a new date IS the reschedule operation (the frozen `Api.scheduleTask`
 * contract only has one op for this — see docs/CONTRACT_CHANGE_REQUESTS.md
 * for why a separate /reschedule route wasn't added). The audit entry
 * captures old -> new scheduledDate either way.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    requireCoordinatorOrAdmin(session);
    const { id } = await params;

    const existing = await getTaskById(id);
    if (session.role === UserRole.COORDINATOR) await requireZoneAccess(session, existing.zoneId);

    const body = parseOrThrow(scheduleTaskBodySchema, await request.json().catch(() => ({})));
    const updated = await scheduleTask(session.sub, id, body.scheduledDate);
    return NextResponse.json(updated);
  });
}
