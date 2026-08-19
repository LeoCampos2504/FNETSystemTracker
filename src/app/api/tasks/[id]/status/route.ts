import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { parseOrThrow } from "@/server/http/validate";
import { updateTaskStatusBodySchema } from "@/server/validation/task.schema";
import { requireCoordinatorOrAdmin, requireSession, requireZoneAccess } from "@/server/http/auth-guards";
import { getTaskById, updateTaskStatus } from "@/server/services/task.service";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    requireCoordinatorOrAdmin(session);
    const { id } = await params;

    const existing = await getTaskById(id);
    if (session.role === UserRole.COORDINATOR) await requireZoneAccess(session, existing.zoneId);

    const body = parseOrThrow(updateTaskStatusBodySchema, await request.json().catch(() => ({})));
    const updated = await updateTaskStatus(session.sub, id, body.status);
    return NextResponse.json(updated);
  });
}
