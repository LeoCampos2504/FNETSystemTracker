import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/server/http/respond";
import { canAccessTechnicianRecord, requireSession } from "@/server/http/auth-guards";
import { forbidden } from "@/server/http/errors";
import { findTechnicianById } from "@/server/services/technician.service";

/** Matches `Api.getTechnician(): Promise<Technician | null>` — "not found" resolves null, never a 404. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    const { id } = await params;

    const technician = await findTechnicianById(id);
    if (!technician) return NextResponse.json(null);

    if (!(await canAccessTechnicianRecord(session, technician))) {
      throw forbidden("You do not have access to this technician");
    }

    return NextResponse.json(technician);
  });
}
