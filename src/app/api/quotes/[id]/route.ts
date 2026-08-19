import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { requireCoordinatorOrAdmin, requireSession, requireZoneAccess } from "@/server/http/auth-guards";
import { getQuoteById } from "@/server/services/quote.service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    requireCoordinatorOrAdmin(session);
    const { id } = await params;

    const quote = await getQuoteById(id);
    if (session.role === UserRole.COORDINATOR) await requireZoneAccess(session, quote.zoneId);

    return NextResponse.json(quote);
  });
}
