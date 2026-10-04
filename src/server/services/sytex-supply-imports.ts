import { getPrismaClient } from "@/server/prisma";
import type { SytexSupplyExport } from "@/server/sytex-supply-export";

export async function saveSytexSupplyExport(parsed: SytexSupplyExport, fileHash: string, fileName: string, importedBy: string) {
  if (parsed.errors.length) throw new Error("SYTEX_EXPORT_HAS_CONFLICTS");
  if (!parsed.items.length) throw new Error("SYTEX_EXPORT_NO_ITEMS");
  const prisma = getPrismaClient();
  const previous = await prisma.sytex_supply_imports.findUnique({ where: { fileHash }, select: { id: true } });
  if (previous) return { importId: previous.id, alreadyImported: true };
  try {
    const saved = await prisma.sytex_supply_imports.create({
      data: {
        fileHash, fileName: fileName.slice(0, 250), importedBy,
        answerCount: parsed.answerCount, formCount: parsed.formCount,
        sourceEditedFrom: parsed.sourceEditedFrom, sourceEditedThrough: parsed.sourceEditedThrough,
        items: { create: parsed.items },
      },
      select: { id: true },
    });
    return { importId: saved.id, alreadyImported: false };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const existing = await prisma.sytex_supply_imports.findUnique({ where: { fileHash }, select: { id: true } });
      if (existing) return { importId: existing.id, alreadyImported: true };
    }
    throw error;
  }
}
