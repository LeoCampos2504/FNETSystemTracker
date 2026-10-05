import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { hasAllowedRequestOrigin } from "@/server/request-origin";
import { parseSytexExportBundle, parseSytexSupplyExport } from "@/server/sytex-supply-export";
import { saveSytexSupplyExport } from "@/server/services/sytex-supply-imports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_BYTES = 40 * 1024 * 1024;
const MAX_FILES = 80;
const headers = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  if (!hasAllowedRequestOrigin(request)) return NextResponse.json({ code: "INVALID_ORIGIN" }, { status: 403, headers });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) return NextResponse.json({ code: "FILE_TOO_LARGE" }, { status: 413, headers });
  let files: File[], mode: string;
  try {
    const form = await request.formData();
    const candidates = form.getAll("file");
    if (!candidates.length || candidates.length > MAX_FILES || candidates.some((candidate) => !(candidate instanceof File) || !candidate.name.toLowerCase().endsWith(".xlsx") || !candidate.size)) return NextResponse.json({ code: "XLSX_REQUIRED" }, { status: 400, headers });
    files = candidates as File[];
    if (files.reduce((total, file) => total + file.size, 0) > MAX_BYTES) return NextResponse.json({ code: "FILE_TOO_LARGE" }, { status: 413, headers });
    mode = String(form.get("mode") ?? "preview");
  } catch { return NextResponse.json({ code: "MULTIPART_INVALID" }, { status: 400, headers }); }
  if (!["preview", "commit"].includes(mode)) return NextResponse.json({ code: "MODE_INVALID" }, { status: 400, headers });
  let parsed;
  let hash: string;
  try {
    const contents = await Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())));
    if (contents.length === 1) {
      parsed = await parseSytexSupplyExport(contents[0]);
      hash = createHash("sha256").update(contents[0]).digest("hex");
    } else {
      parsed = await parseSytexExportBundle(contents);
      // Order-independent identity, so the same set of exports is never stored twice.
      const digests = contents.map((bytes) => createHash("sha256").update(bytes).digest("hex")).sort();
      hash = createHash("sha256").update(digests.join("\n")).digest("hex");
    }
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith("SYTEX_EXPORT_") ? error.message : "XLSX_INVALID";
    return NextResponse.json({ code }, { status: 422, headers });
  }
  const projects = [...new Set((parsed.formContexts ?? []).map((form) => form.project))].sort((a, b) => a.localeCompare(b, "es"));
  const fileName = files.length === 1 ? files[0].name : `${files.length} archivos de Sytex`;
  const preview = {
    fileCount: files.length, formContextCount: parsed.formContexts?.length ?? 0, projects,
    answerCount: parsed.answerCount, formCount: parsed.formCount, itemCount: parsed.items.length,
    sourceEditedFrom: parsed.sourceEditedFrom, sourceEditedThrough: parsed.sourceEditedThrough,
    warningCount: parsed.warnings.length, errorCount: parsed.errors.length,
    warnings: parsed.warnings.slice(0, 50), errors: parsed.errors.slice(0, 50),
    items: parsed.items.slice(0, 20).map((item) => ({
      formulario: item.formulario, grupo: item.grupo, indice: item.indice,
      description: item.description, quantity: item.quantity,
      image: item.image, imageDeclared: item.imageDeclared,
    })),
  };
  if (mode === "preview") return NextResponse.json(preview, { headers });
  if (parsed.errors.length || !parsed.items.length) return NextResponse.json({ code: parsed.errors.length ? "SYTEX_EXPORT_HAS_CONFLICTS" : "SYTEX_EXPORT_NO_ITEMS", ...preview }, { status: 422, headers });
  try {
    const saved = await saveSytexSupplyExport(parsed, hash, fileName, authorization.user.id);
    return NextResponse.json({ ...preview, ...saved, imported: true }, { headers });
  } catch { return NextResponse.json({ code: "SYTEX_IMPORT_FAILED" }, { status: 503, headers }); }
}
