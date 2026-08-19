import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { requireSession, requireZoneAccess } from "@/server/http/auth-guards";
import { forbidden } from "@/server/http/errors";
import { getGuardById, getGuardPerformance } from "@/server/services/guard.service";

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

    const performance = await getGuardPerformance(id);
    return NextResponse.json(performance);
  });
}
