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
      // Validated independently (not nested if/else-if) so a coordinator
      // can't combine an allowed zoneId with someone else's coordinatorId
      // to smuggle an unauthorized filter past the check.
      if (query.coordinatorId && query.coordinatorId !== session.coordinatorId) {
        throw forbidden("You can only view your own quotes");
      }
      if (query.zoneId) {
        await requireZoneAccess(session, query.zoneId);
      }
      if (!query.zoneId && !query.coordinatorId) {
        query.coordinatorId = session.coordinatorId ?? undefined;
      }
    }

    const quotes = await listQuotes(query);
    return NextResponse.json(quotes);
  });
}
