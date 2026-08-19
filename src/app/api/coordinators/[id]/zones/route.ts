import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { requireCoordinatorOrAdmin, requireSession } from "@/server/http/auth-guards";
import { forbidden } from "@/server/http/errors";
import { getCoordinatorZones } from "@/server/services/coordination.service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    requireCoordinatorOrAdmin(session);
    const { id } = await params;

    if (session.role === UserRole.COORDINATOR && session.coordinatorId !== id) {
      throw forbidden("You can only view your own zones");
    }

    const zones = await getCoordinatorZones(id);
    return NextResponse.json(zones);
  });
}
