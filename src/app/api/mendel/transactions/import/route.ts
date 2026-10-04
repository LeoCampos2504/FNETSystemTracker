import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { getPrismaClient } from "@/server/prisma";
import { parseMendelCsv } from "@/server/mendel-csv";
import { hasAllowedRequestOrigin } from "@/server/request-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  if (!hasAllowedRequestOrigin(request)) return NextResponse.json({ code: "INVALID_ORIGIN" }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) return NextResponse.json({ code: "FILE_TOO_LARGE" }, { status: 413 });

  let file: File;
  let mode: string;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (!(candidate instanceof File)) return NextResponse.json({ code: "CSV_REQUIRED" }, { status: 400 });
    if (!candidate.name.toLowerCase().endsWith(".csv") || candidate.size === 0 || candidate.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ code: candidate.size > MAX_UPLOAD_BYTES ? "FILE_TOO_LARGE" : "CSV_INVALID" }, { status: candidate.size > MAX_UPLOAD_BYTES ? 413 : 400 });
    }
    file = candidate;
    mode = String(form.get("mode") ?? "preview");
  } catch {
    return NextResponse.json({ code: "MULTIPART_INVALID" }, { status: 400 });
  }
  if (mode !== "preview" && mode !== "commit") return NextResponse.json({ code: "MODE_INVALID" }, { status: 400 });

  let parsed: ReturnType<typeof parseMendelCsv>;
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    parsed = parseMendelCsv(bytes);
  } catch (error) {
    const code = error instanceof Error ? error.message : "CSV_INVALID";
    const status = code === "CSV_EMPTY" ? 400 : 422;
    return NextResponse.json({ code: ["CSV_EMPTY", "CSV_INVALID_QUOTE", "CSV_REQUIRED_HEADERS_MISSING"].includes(code) ? code : "CSV_INVALID" }, { status });
  }
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  try {
    const prisma = getPrismaClient();
    const ids = parsed.rows.map((row) => row.transactionId);
    const existing = ids.length ? await prisma.mendel_transactions.findMany({ where: { transactionId: { in: ids } }, select: { transactionId: true } }) : [];
    const existingIds = new Set(existing.map(({ transactionId }) => transactionId));
    const insertedCount = ids.filter((id) => !existingIds.has(id)).length;
    const updatedCount = ids.length - insertedCount;
    const preview = {
      rowCount: parsed.rows.length,
      insertedCount,
      updatedCount,
      duplicateRowsSkipped: parsed.duplicateCount,
      invalidRows: parsed.invalidRowCount,
      errors: parsed.errors,
      transactionsWithFormReferences: parsed.rows.filter((row) => row.formReferences?.length).length,
    };
    if (mode === "preview") return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
    if (parsed.invalidRowCount > 0) return NextResponse.json({ code: "CSV_HAS_INVALID_ROWS", ...preview }, { status: 422, headers: { "Cache-Control": "no-store" } });
    if (!parsed.rows.length) return NextResponse.json({ code: "CSV_NO_TRANSACTIONS" }, { status: 422 });

    await prisma.$transaction(async (tx) => {
      for (const row of parsed.rows) {
        const { transactionId, formReferences, ...data } = row;
        await tx.mendel_transactions.upsert({
          where: { transactionId },
          create: { transactionId, ...data },
          update: data,
        });
        if (formReferences !== undefined) {
          await tx.mendel_form_references.deleteMany({ where: { transactionId } });
          if (formReferences.length) await tx.mendel_form_references.createMany({
            data: formReferences.map((formCode) => ({ transactionId, formCode })),
          });
        }
      }
      await tx.mendel_import_batches.create({
        data: { fileHash, rowCount: parsed.rows.length, insertedCount, updatedCount, importedBy: authorization.user.id },
      });
    }, { maxWait: 10_000, timeout: 60_000 });
    return NextResponse.json({ ...preview, imported: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "MENDEL_IMPORT_FAILED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
