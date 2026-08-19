import type { Technician } from "@/contracts";
import { repositories } from "@/server/container";
import { notFound } from "@/server/http/errors";

export async function getTechnicianById(technicianId: string): Promise<Technician> {
  const technician = await repositories.technician.findById(technicianId);
  if (!technician) throw notFound(`Technician not found: ${technicianId}`);
  return technician;
}
