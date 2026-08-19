import type { Vehicle } from "@/contracts";
import { repositories } from "@/server/container";

export async function getVehicleById(vehicleId: string): Promise<Vehicle | null> {
  return repositories.vehicle.findById(vehicleId);
}

export async function getTechnicianVehicle(technicianId: string): Promise<Vehicle | null> {
  return repositories.vehicle.findByTechnician(technicianId);
}
