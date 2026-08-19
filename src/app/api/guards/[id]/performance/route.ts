import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { requireSession, requireZoneAccess } from "@/server/http/auth-guards";
import { forbidden } from "@/server/http/errors";
import { findGuardById, getGuardPerformance } from "@/server/services/guard.service";

/** Matches `Api.getGuardPerformance(): Promise<GuardPerformance | null>` — a missing guard resolves null, never a 404. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    const { id } = await params;
    const guard = await findGuardById(id);
    if (!guard) return NextResponse.json(null);

    if (session.role === UserRole.TECHNICIAN) {
      if (!session.technicianId || !guard.technicianIds.includes(session.technicianId)) {
        throw forbidden("You do not have access to this guard");
      }
    } else if (session.role === UserRole.COORDINATOR) {
      await requireZoneAccess(session, guard.zoneId);
    }

    const performance = await getGuardPerformance(id);
    return NextResponse.json(performance);
  });
}
