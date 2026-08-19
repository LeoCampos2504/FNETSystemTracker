import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/server/http/respond";
import { requireSession, requireTechnicianAccess } from "@/server/http/auth-guards";
import { getTechnicianVehicle } from "@/server/services/vehicle.service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    const { id } = await params;
    await requireTechnicianAccess(session, id);

    const vehicle = await getTechnicianVehicle(id);
    return NextResponse.json(vehicle);
  });
}
