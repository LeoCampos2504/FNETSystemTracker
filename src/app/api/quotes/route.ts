import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { parseOrThrow, searchParamsToObject } from "@/server/http/validate";
import { quoteListQuerySchema } from "@/server/validation/quote.schema";
import { requireCoordinatorOrAdmin, requireSession, requireZoneAccess } from "@/server/http/auth-guards";
import { forbidden } from "@/server/http/errors";
import { listQuotes } from "@/server/services/quote.service";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    requireCoordinatorOrAdmin(session);

    const query = parseOrThrow(quoteListQuerySchema, searchParamsToObject(request.nextUrl.searchParams));

    if (session.role === UserRole.COORDINATOR) {
      if (query.zoneId) {
        await requireZoneAccess(session, query.zoneId);
      } else if (query.coordinatorId && query.coordinatorId !== session.coordinatorId) {
        throw forbidden("You can only view your own quotes");
      } else if (!query.coordinatorId) {
        query.coordinatorId = session.coordinatorId ?? undefined;
      }
    }

    const quotes = await listQuotes(query);
    return NextResponse.json(quotes);
  });
}
