import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { requireCoordinatorOrAdmin, requireSession, requireZoneAccess } from "@/server/http/auth-guards";
import { getZoneTechnicians } from "@/server/services/coordination.service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    requireCoordinatorOrAdmin(session);
    const { id } = await params;

    if (session.role === UserRole.COORDINATOR) await requireZoneAccess(session, id);

    const technicians = await getZoneTechnicians(id);
    return NextResponse.json(technicians);
  });
}
