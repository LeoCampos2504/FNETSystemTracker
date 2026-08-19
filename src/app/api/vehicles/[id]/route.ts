import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { requireSession, requireTechnicianAccess } from "@/server/http/auth-guards";
import { forbidden } from "@/server/http/errors";
import { getVehicleById } from "@/server/services/vehicle.service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    const { id } = await params;
    const vehicle = await getVehicleById(id);

    if (vehicle && session.role !== UserRole.ADMIN) {
      if (!vehicle.assignedTechnicianId) {
        throw forbidden("This vehicle has no assigned technician to authorize against");
      }
      await requireTechnicianAccess(session, vehicle.assignedTechnicianId);
    }

    return NextResponse.json(vehicle);
  });
}
