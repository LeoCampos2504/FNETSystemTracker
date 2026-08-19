import type { Vehicle } from "@/contracts";

export interface VehicleRepository {
  findById(id: string): Promise<Vehicle | null>;
  findByTechnician(technicianId: string): Promise<Vehicle | null>;
}
