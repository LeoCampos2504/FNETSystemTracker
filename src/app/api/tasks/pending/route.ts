import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/server/http/respond";
import { parseOrThrow, searchParamsToObject } from "@/server/http/validate";
import { pendingTaskQuerySchema } from "@/server/validation/task.schema";
import { requireSession } from "@/server/http/auth-guards";
import { resolveScope } from "@/server/http/scope";
import { getPendingTasks } from "@/server/services/task.service";
import { MOCK_TODAY, toDateString } from "@/mocks";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    const query = parseOrThrow(pendingTaskQuerySchema, searchParamsToObject(request.nextUrl.searchParams));
    const scope = await resolveScope(session, { technicianId: query.technicianId, zoneId: query.zoneId });
    const asOfDate = query.asOfDate ?? toDateString(MOCK_TODAY);

    const tasks = await getPendingTasks({ technicianId: scope.technicianId, zoneIds: scope.zoneIds, asOfDate });
    return NextResponse.json(tasks);
  });
}
