import type { Technician } from "@/contracts";
import { repositories } from "@/server/container";

/** Matches `Api.getTechnician()`/`Api.getTechnicianVehicle()`: "not found" resolves null, never a throw. */
export async function findTechnicianById(technicianId: string): Promise<Technician | null> {
  return repositories.technician.findById(technicianId);
}
