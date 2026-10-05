import { NextResponse } from "next/server";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { privateHeaders, supplyFailure } from "@/server/supply-http";
import { uuid } from "@/server/supply-input";
import { addFile, SupplyError, MAX_FILE_BYTES } from "@/server/services/supply-control";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { hasAllowedRequestOrigin } from "@/server/request-origin";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try { const id = uuid.parse((await context.params).id);
    if (!hasAllowedRequestOrigin(request)) throw new SupplyError("INVALID_ORIGIN", 403);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 65536) throw new SupplyError("FILE_TOO_LARGE", 413);
    // Bound the complete multipart body even if Content-Length is omitted.
    const reader = request.body?.getReader(); if (!reader) throw new SupplyError("INPUT_INVALID", 422);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_FILE_BYTES + 65536) { await reader.cancel(); throw new SupplyError("FILE_TOO_LARGE", 413); } chunks.push(value); }
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
    const file = form.get("file"); if (!(file instanceof File) || !file.size) throw new SupplyError("FILE_REQUIRED", 422);
    return NextResponse.json(await addFile(id, new Uint8Array(await file.arrayBuffer()), file.name, authorization.user.id), { headers: privateHeaders });
  } catch (error) { return supplyFailure(error); }
}
