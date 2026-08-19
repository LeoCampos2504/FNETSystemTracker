import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/server/http/respond";
import { parseOrThrow, searchParamsToObject } from "@/server/http/validate";
import { taskDayQuerySchema } from "@/server/validation/task.schema";
import { requireSession } from "@/server/http/auth-guards";
import { resolveScope } from "@/server/http/scope";
import { getTasksForDay } from "@/server/services/task.service";
import { MOCK_TODAY, toDateString } from "@/mocks";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    const query = parseOrThrow(taskDayQuerySchema, searchParamsToObject(request.nextUrl.searchParams));
    const scope = await resolveScope(session, query);
    const date = query.date ?? toDateString(MOCK_TODAY);

    const tasks = await getTasksForDay({ technicianId: scope.technicianId, zoneIds: scope.zoneIds, date });
    return NextResponse.json(tasks);
  });
}
