import { NextResponse, type NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { withErrorHandling } from "@/server/http/respond";
import { requireSession } from "@/server/http/auth-guards";
import { badRequest, forbidden } from "@/server/http/errors";
import { listNotificationsForUser } from "@/server/services/notification.service";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const session = await requireSession(request);
    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) throw badRequest("userId is required");

    if (session.role !== UserRole.ADMIN && session.sub !== userId) {
      throw forbidden("You can only view your own notifications");
    }

    const notifications = await listNotificationsForUser(userId);
    return NextResponse.json(notifications);
  });
}
