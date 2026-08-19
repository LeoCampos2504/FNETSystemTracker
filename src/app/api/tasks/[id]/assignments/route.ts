import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { parseOrThrow } from "@/server/http/validate";
import { assignTechniciansBodySchema } from "@/server/validation/task.schema";
import { requireCoordinatorOrAdmin, requireSession, requireZoneAccess } from "@/server/http/auth-guards";
import { assignTechniciansToTask, getTaskById } from "@/server/services/task.service";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    requireCoordinatorOrAdmin(session);
    const { id } = await params;

    const existing = await getTaskById(id);
    if (session.role === UserRole.COORDINATOR) await requireZoneAccess(session, existing.zoneId);

    const body = parseOrThrow(assignTechniciansBodySchema, await request.json().catch(() => ({})));
    const updated = await assignTechniciansToTask(session.sub, id, body.assignments);
    return NextResponse.json(updated);
  });
}
