import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/server/services/auth-sessions";
import { getPrismaClient } from "@/server/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authorization = await requireAdminSession();
  if (!authorization.ok) return authorization.response;
  try {
    const prisma = getPrismaClient();
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("q")?.trim().slice(0, 100);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const overdueOnly = searchParams.get("overdue") === "true";
    const page = Math.max(1, Math.min(10000, Number(searchParams.get("page") ?? 1) || 1));
    const dateFilter: { gte?: Date; lte?: Date } = {};
    const validDay = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const date = new Date(`${value}T12:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    if (from && validDay(from)) dateFilter.gte = new Date(`${from}T00:00:00-03:00`);
    if (to && validDay(to)) dateFilter.lte = new Date(`${to}T23:59:59.999-03:00`);
    const baseWhere = {
      ...(Object.keys(dateFilter).length ? { transactionDate: dateFilter } : {}),
      ...(search ? { OR: [
        { userName: { contains: search, mode: "insensitive" as const } },
        { merchant: { contains: search, mode: "insensitive" as const } },
        { transactionCategory: { contains: search, mode: "insensitive" as const } },
        { transactionId: { contains: search, mode: "insensitive" as const } },
      ] } : {}),
    };
    const receiptMissing = { OR: [
      { hasReceipt: false },
      { AND: [{ hasReceipt: null }, { receiptStatus: { contains: "SIN COMPROBANTE", mode: "insensitive" as const } }] },
    ] };
    const overdueReceiptFilter = { AND: [receiptMissing, { transactionDate: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }] };
    const where = overdueOnly ? { AND: [baseWhere, overdueReceiptFilter] } : baseWhere;
    const [items, total, currencyAggregates, pendingReceipt, overdueReceipt, pendingReconciliation, latestBatch] = await Promise.all([
      prisma.mendel_transactions.findMany({
        where, orderBy: { transactionDate: "desc" }, skip: (page - 1) * 50, take: 50,
        select: {
          transactionId: true, transactionDate: true, confirmationDate: true, userName: true, merchant: true,
          totalAmount: true, currency: true, budget: true, transactionType: true, transactionStatus: true,
          transactionCategory: true, hasReceipt: true, invoiceTotal: true, receiptStatus: true, reconciliationStatus: true,
        },
      }),
      prisma.mendel_transactions.count({ where }),
      prisma.mendel_transactions.groupBy({ by: ["currency"], where, _sum: { totalAmount: true }, orderBy: { currency: "asc" } }),
      prisma.mendel_transactions.count({ where: { AND: [baseWhere, receiptMissing] } }),
      prisma.mendel_transactions.count({ where: { AND: [baseWhere, overdueReceiptFilter] } }),
      prisma.mendel_transactions.count({ where: { AND: [baseWhere, { reconciliationStatus: "PENDING" }] } }),
      prisma.mendel_import_batches.findFirst({ orderBy: { importedAt: "desc" }, select: { importedAt: true, rowCount: true, insertedCount: true, updatedCount: true } }),
    ]);
    return NextResponse.json({
      items, total, page, pageSize: 50,
      summary: {
        totalTransactions: total,
        amountByCurrency: currencyAggregates.map((aggregate) => ({ currency: aggregate.currency, totalAmount: aggregate._sum.totalAmount?.toString() ?? "0" })),
        pendingReceipt, overdueReceipt, pendingReconciliation,
      },
      latestImport: latestBatch,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "MENDEL_DATA_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
