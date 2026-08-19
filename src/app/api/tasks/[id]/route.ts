import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { requireSession, requireZoneAccess } from "@/server/http/auth-guards";
import { forbidden } from "@/server/http/errors";
import { findTaskById } from "@/server/services/task.service";

/** Matches `Api.getTask(): Promise<Task | null>` — "not found" resolves null, never a 404. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    const { id } = await params;
    const task = await findTaskById(id);
    if (!task) return NextResponse.json(null);

    if (session.role === UserRole.TECHNICIAN) {
      if (!task.assignments.some((a) => a.technicianId === session.technicianId)) {
        throw forbidden("You do not have access to this task");
      }
    } else if (session.role === UserRole.COORDINATOR) {
      await requireZoneAccess(session, task.zoneId);
    }

    return NextResponse.json(task);
  });
}
