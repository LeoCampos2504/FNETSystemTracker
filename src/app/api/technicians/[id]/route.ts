import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/server/http/respond";
import { requireSession, requireTechnicianAccess } from "@/server/http/auth-guards";
import { getTechnicianById } from "@/server/services/technician.service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    const { id } = await params;
    await requireTechnicianAccess(session, id);

    const technician = await getTechnicianById(id);
    return NextResponse.json(technician);
  });
}
