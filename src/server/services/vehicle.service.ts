import type { Vehicle } from "@/contracts";
import type { BackendRepositories } from "@/server/ports";
import { repositories as defaultRepositories } from "@/server/container";

export interface VehicleService {
  getVehicleById(vehicleId: string): Promise<Vehicle | null>;
  getTechnicianVehicle(technicianId: string): Promise<Vehicle | null>;
}

type VehicleRepositories = Pick<BackendRepositories, "vehicle">;

/** Pure factory: depends only on the `vehicle` port. */
export function createVehicleService(repositories: VehicleRepositories): VehicleService {
  return {
    async getVehicleById(vehicleId) {
      return repositories.vehicle.findById(vehicleId);
    },

    async getTechnicianVehicle(technicianId) {
      return repositories.vehicle.findByTechnician(technicianId);
    },
  };
}

// Default instance bound to the app's default (memory, for now) repositories
// — preserves today's call sites (flat function imports) untouched.
const defaultVehicleService = createVehicleService(defaultRepositories);
export const { getVehicleById, getTechnicianVehicle } = defaultVehicleService;
