import type { MaintenanceIntervalMonths } from "@/contracts";

export function calculateNextMaintenanceDate(lastPerformedAt: string, intervalMonths: MaintenanceIntervalMonths): string {
  const date = new Date(lastPerformedAt);
  date.setUTCMonth(date.getUTCMonth() + intervalMonths);
  return date.toISOString();
}

export function maintenanceDueStatus(nextDueAt: string | null, asOf: Date): "AL_DIA" | "PROXIMO" | "VENCE_ESTE_MES" | "VENCIDO" {
  if (!nextDueAt) return "AL_DIA";
  const due = new Date(nextDueAt);
  if (due < asOf) return "VENCIDO";
  const monthEnd = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0, 23, 59, 59));
  if (due <= monthEnd) return "VENCE_ESTE_MES";
  const soon = new Date(asOf.getTime() + 30 * 86_400_000);
  return due <= soon ? "PROXIMO" : "AL_DIA";
}
