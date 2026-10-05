import { NextResponse } from "next/server";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { privateHeaders, readInput, supplyFailure } from "@/server/supply-http";
import { uuid } from "@/server/supply-input";
import { privateFile, removeFile } from "@/server/services/supply-control";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { z } from "zod";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try { const id = uuid.parse((await context.params).id);
    const file = await privateFile(id);
    return new Response(new Uint8Array(file.content), { headers: { ...privateHeaders, "Content-Type": file.mimeType, "Content-Length": String(file.byteCount), "Content-Security-Policy": "sandbox", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}` } });
  } catch (error) { return supplyFailure(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try { const id = uuid.parse((await context.params).id);
    const input = await readInput(request, z.object({ version: z.number().int().nonnegative(), reason: z.string().trim().min(3).max(500) }));
    return NextResponse.json(await removeFile(id, input.version, input.reason, authorization.user.id), { headers: privateHeaders });
  } catch (error) { return supplyFailure(error); }
}
