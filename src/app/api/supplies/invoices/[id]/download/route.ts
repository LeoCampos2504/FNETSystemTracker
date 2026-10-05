
import { requireAdminSession } from "@/server/services/auth-sessions";
import { privateHeaders, supplyFailure } from "@/server/supply-http";
import { uuid } from "@/server/supply-input";
import { invoiceFiles, SupplyError } from "@/server/services/supply-control";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { zipSync } from "fflate";
import { hasAllowedRequestOrigin } from "@/server/request-origin";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try { const id = uuid.parse((await context.params).id);
    if (!hasAllowedRequestOrigin(request)) throw new SupplyError("INVALID_ORIGIN", 403);
    const invoice = await invoiceFiles(id);
    const files = Object.fromEntries(invoice.attachments.map((file, index) => [`${index + 1}-${file.fileName}`, new Uint8Array(file.content)]));
    const bytes = zipSync(files, { level: 0 });
    // Serving a package does not prove that the user saved it. The UI asks for confirmation separately.
    return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="factura-${id}.zip"` } });
  } catch (error) { return supplyFailure(error); }
}
