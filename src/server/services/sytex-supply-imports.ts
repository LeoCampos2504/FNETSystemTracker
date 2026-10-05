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
        ...(parsed.formContexts ? { forms: { create: parsed.formContexts.map((form) => ({ code: form.code, type: form.type, project: form.project, siteCode: form.siteCode, siteName: form.siteName, description: form.description, technicians: form.technicians })) }, links: { create: parsed.formContexts.flatMap((form) => form.link ? [{ code: form.code, link: form.link }] : []) }, states: { create: parsed.formContexts.flatMap((form) => form.status || form.planDate ? [{ code: form.code, status: form.status ?? "", planDate: form.planDate ? new Date(form.planDate + "T00:00:00Z") : null }] : []) } } : {}),
        ...(parsed.maintenance ? { maintenance: { create: parsed.maintenance.map((fact) => ({ ...fact, lastDate: new Date(fact.lastDate + "T00:00:00Z") })) } } : {}),
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
