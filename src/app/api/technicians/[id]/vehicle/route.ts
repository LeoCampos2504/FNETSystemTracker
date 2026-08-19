import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/server/http/respond";
import { canAccessTechnicianRecord, requireSession } from "@/server/http/auth-guards";
import { forbidden } from "@/server/http/errors";
import { findTechnicianById } from "@/server/services/technician.service";
import { getTechnicianVehicle } from "@/server/services/vehicle.service";

/**
 * Matches `Api.getTechnicianVehicle(): Promise<Vehicle | null>`. A missing
 * technicianId now resolves null for every role (previously a COORDINATOR
 * querying an unknown id got a 403 instead, because the old access check
 * did its own existence lookup and treated "not found" as "not allowed").
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    const { id } = await params;

    const technician = await findTechnicianById(id);
    if (!technician) return NextResponse.json(null);

    if (!(await canAccessTechnicianRecord(session, technician))) {
      throw forbidden("You do not have access to this technician");
    }

    const vehicle = await getTechnicianVehicle(id);
    return NextResponse.json(vehicle);
  });
}
