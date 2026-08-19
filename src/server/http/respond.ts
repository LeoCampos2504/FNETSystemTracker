import { NextResponse } from "next/server";
import { ApiError } from "./errors";

export function jsonError(error: ApiError): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    },
    { status: error.status },
  );
}

/** Wraps a route handler body so every thrown ApiError becomes a consistent JSON error response. */
export async function withErrorHandling(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ApiError) return jsonError(error);
    console.error(error);
    return jsonError(new ApiError(500, "INTERNAL_ERROR", "Unexpected server error"));
  }
}
