import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { getPrismaClient } from "@/server/prisma";
import { reconcileSupplyForms } from "@/server/supply-reconciliation";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  const importId = request.nextUrl.searchParams.get("importId");
  if (importId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(importId)) return NextResponse.json({ code: "IMPORT_ID_INVALID" }, { status: 400, headers });
  try {
    const prisma = getPrismaClient();
    const batch = await prisma.sytex_supply_imports.findFirst({
      where: importId ? { id: importId } : undefined, orderBy: { importedAt: "desc" },
      include: { items: { orderBy: [{ formulario: "asc" }, { grupo: "asc" }, { indice: "asc" }] } },
    });
    if (!batch) return NextResponse.json({ source: "sytex-export", count: 0, items: [], exportDetails: null }, { headers });
    const [technicians, transactions] = await Promise.all([
      prisma.preventivos.findMany({ where: { codigo: { in: [...new Set(batch.items.map((item) => item.formulario))] } }, select: { codigo: true, asignado_a: true } }),
      prisma.mendel_transactions.findMany({
        select: { transactionId: true, transactionDate: true, merchant: true, totalAmount: true, currency: true, referenceCode: true, budgetId: true, transactionStatus: true, hasReceipt: true, receiptStatus: true, reconciliationStatus: true, formReferences: { select: { formCode: true } } },
        orderBy: { transactionDate: "desc" },
      }),
    ]);
    const assigned = new Map(technicians.map((row) => [row.codigo, row.asignado_a]));
    const items = reconcileSupplyForms(batch.items.map((row) => ({
      id: row.id, formulario: row.formulario, grupo: row.grupo, indice: row.indice,
      description: row.description, quantity: row.quantity ? Number(row.quantity.toString()) : null,
      provider: row.provider, siteCode: row.siteCode, siteName: row.siteName, status: row.status,
      image: row.image, imageDeclared: row.imageDeclared, technician: assigned.get(row.formulario) ?? null,
      lastEditedBy: row.lastEditedBy, sourceEditedAt: row.sourceEditedAt, syncedAt: batch.importedAt.toISOString(),
    })), transactions);
    const relatedForms = new Set(items.filter((item) => item.mendel.candidateCount > 0).map((item) => item.formulario));
    return NextResponse.json({
      source: "sytex-export", count: items.length, items,
      exportDetails: { id: batch.id, fileName: batch.fileName, importedAt: batch.importedAt.toISOString(), answerCount: batch.answerCount, formCount: batch.formCount, sourceEditedFrom: batch.sourceEditedFrom, sourceEditedThrough: batch.sourceEditedThrough },
      mendelSummary: {
        totalTransactions: transactions.length, totalForms: new Set(items.map((item) => item.formulario)).size, relatedForms: relatedForms.size,
        matchedSupplies: items.filter((item) => item.mendel.status === "MATCHED").length,
        ambiguousSupplies: items.filter((item) => item.mendel.status === "AMBIGUOUS").length,
        unmatchedSupplies: items.filter((item) => item.mendel.status === "UNMATCHED").length,
        transactionsWithFormReferences: transactions.filter((row) => row.formReferences.length > 0).length,
      },
    }, { headers });
  } catch { return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503, headers }); }
}
