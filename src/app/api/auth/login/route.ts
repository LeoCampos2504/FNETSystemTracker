import { NextResponse, type NextRequest } from "next/server";
import { withErrorHandling } from "@/server/http/respond";
import { parseOrThrow } from "@/server/http/validate";
import { loginBodySchema } from "@/server/validation/auth.schema";
import { login } from "@/server/services/auth.service";
import { attachSessionCookie } from "@/server/auth/session";

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const body = parseOrThrow(loginBodySchema, await request.json().catch(() => ({})));
    const { session, token } = await login(body.email, body.password);

    const response = NextResponse.json(session);
    attachSessionCookie(response, token);
    return response;
  });
}
