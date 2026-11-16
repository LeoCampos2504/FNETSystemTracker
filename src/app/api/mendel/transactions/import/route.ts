import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { getPrismaClient } from "@/server/prisma";
import { parseMendelCsv } from "@/server/mendel-csv";
import { hasAllowedRequestOrigin } from "@/server/request-origin";
import { operationalDateKey } from "@/lib/operational-timezone";
import { importMendelBatch } from "@/server/mendel-import-batch";
import { resolveMendelIdentities } from "@/server/mendel-identity";

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
    parsed = parseMendelCsv(bytes, { requireFullId: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CSV_INVALID";
    const status = code === "CSV_EMPTY" ? 400 : 422;
    return NextResponse.json({ code: ["CSV_EMPTY", "CSV_INVALID_QUOTE", "CSV_REQUIRED_HEADERS_MISSING"].includes(code) ? code : "CSV_INVALID" }, { status });
  }
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  const fileName = (file.name.split(/[\\/]/).pop() ?? "importacion.csv").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "importacion.csv";
  const days = parsed.rows.map((row) => operationalDateKey(row.transactionDate)).sort();
  try {
    const prisma = getPrismaClient();
    const shortIds = parsed.rows.map(row => row.transactionId), fullIds = parsed.rows.map(row => row.fullId!);
    const mappings = shortIds.length ? await prisma.$queryRaw<Array<{transactionId:string;fullId:string|null}>>`SELECT transaction_id AS "transactionId",full_id AS "fullId" FROM mendel_purchase_details WHERE transaction_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(shortIds)}::jsonb)) OR full_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(fullIds)}::jsonb))` : [];
    const candidateIds = [...new Set([...shortIds, ...fullIds, ...mappings.map(row => row.transactionId)])];
    const existing = candidateIds.length ? await prisma.mendel_transactions.findMany({ where: { transactionId: { in: candidateIds } }, select: { transactionId: true } }) : [];
    const existingIds = new Set(existing.map(({ transactionId }) => transactionId));
    const resolved = resolveMendelIdentities(parsed.rows, parsed.recordNumbers, existingIds, mappings);
    const ids = resolved.rows.map(row => row.transactionId);
    const insertedCount = ids.filter((id) => !existingIds.has(id)).length;
    const updatedCount = ids.length - insertedCount;
    const preview = {
      rowCount: resolved.rows.length,
      insertedCount,
      updatedCount,
      duplicateRowsSkipped: parsed.duplicateCount,
      invalidRows: parsed.invalidRowCount + resolved.ambiguous.length,
      errors: [...parsed.errors, ...resolved.ambiguous].slice(0, 100),
      rowResults: [
        ...resolved.rows.map((row, index) => ({ record: resolved.records[index], transactionId: row.fullId!, action: existingIds.has(row.transactionId) ? 'ACTUALIZAR' : 'AGREGAR' })),
        ...parsed.duplicates.map(row => ({ ...row, action: 'REPETIDA_OMITIDA' })),
      ].sort((a, b) => a.record - b.record),
      fileName,
      periodStart: days[0] ?? null,
      periodEnd: days.at(-1) ?? null,
      transactionsWithFormReferences: parsed.rows.filter((row) => row.formReferences?.length).length,
    };
    if (mode === "preview") return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
    // Conflicting identifiers require review instead of associating the wrong purchase.
    if (parsed.identityConflict)
      return NextResponse.json({ code: "CSV_ID_CONFLICT", ...preview }, { status: 422, headers: { "Cache-Control": "no-store" } });
    if (!resolved.rows.length) return NextResponse.json({ code: "CSV_NO_TRANSACTIONS", ...preview }, { status: 422 });

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < resolved.rows.length; i += 500) await importMendelBatch(tx, resolved.rows.slice(i, i + 500), parsed.presentSourceKeys);
      const batch = await tx.mendel_import_batches.create({
        data: { fileHash, rowCount: resolved.rows.length, insertedCount, updatedCount, importedBy: authorization.user.id }, select: { id: true },
      });
      // Keep the original in a private database table, in the same transaction as the import.
      await tx.$executeRaw`INSERT INTO mendel_csv_archives(batch_id,file_name,file_content,period_start,period_end,invalid_count,duplicate_count)
        VALUES (${batch.id},${fileName},${Buffer.from(bytes)},${days[0]}::date,${days[days.length - 1]}::date,${preview.invalidRows},${parsed.duplicateCount})`;
    }, { maxWait: 10_000, timeout: 60_000 });
    return NextResponse.json({ ...preview, imported: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const conflict = error instanceof Error && error.message === 'MENDEL_ID_CONFLICT';
    return NextResponse.json({ code: conflict ? 'CSV_ID_CONFLICT' : "MENDEL_IMPORT_FAILED" }, { status: conflict ? 409 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
