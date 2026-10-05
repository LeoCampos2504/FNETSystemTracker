import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { hasAllowedRequestOrigin } from "@/server/request-origin";
import { SupplyError } from "@/server/services/supply-control";
export const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export function supplyFailure(error: unknown) {
  if (error instanceof SupplyError) return NextResponse.json({ code: error.code }, { status: error.status, headers: privateHeaders });
  if (error instanceof ZodError) return NextResponse.json({ code: "INPUT_INVALID", fields: error.issues.map((i) => i.path.join(".")) }, { status: 422, headers: privateHeaders });
  const message = error instanceof Error ? error.message : "";
  if (["DUPLICATE_FORM", "INSUFFICIENT_REMAINING", "EXHAUSTED_REQUIRES_ALL_REMAINING"].includes(message)) return NextResponse.json({ code: message }, { status: 422, headers: privateHeaders });
  if (error && typeof error === "object" && "code" in error && ["P2002", "P2034"].includes(String(error.code))) return NextResponse.json({ code: "CONCURRENT_OR_DUPLICATE_RECORD" }, { status: 409, headers: privateHeaders });
  console.error("Supply operation failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ code: "SUPPLY_DATABASE_UNAVAILABLE" }, { status: 503, headers: privateHeaders });
}
export async function readInput<T>(request: Request, schema: ZodType<T>) {
  if (!hasAllowedRequestOrigin(request)) throw new SupplyError("INVALID_ORIGIN", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 65536) throw new SupplyError("INPUT_TOO_LARGE", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new SupplyError("INPUT_INVALID", 422);
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); throw new SupplyError("INPUT_TOO_LARGE", 413); } chunks.push(value); }
  let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new SupplyError("INPUT_INVALID", 422); }
  return schema.parse(body);
}
