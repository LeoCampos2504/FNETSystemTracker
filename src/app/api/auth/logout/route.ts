import { NextResponse } from "next/server";
import { withErrorHandling } from "@/server/http/respond";
import { clearSessionCookie } from "@/server/auth/session";

export async function POST() {
  return withErrorHandling(async () => {
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
  });
}
