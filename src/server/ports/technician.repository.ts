import type { Technician } from "@/contracts";

export interface TechnicianRepository {
  findById(id: string): Promise<Technician | null>;
  listByZone(zoneId: string): Promise<Technician[]>;
}
