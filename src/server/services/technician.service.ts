import type { Technician } from "@/contracts";
import type { BackendRepositories } from "@/server/ports";
import { repositories as defaultRepositories } from "@/server/container";

export interface TechnicianService {
  findTechnicianById(technicianId: string): Promise<Technician | null>;
}

type TechnicianRepositories = Pick<BackendRepositories, "technician">;

/** Pure factory: depends only on the `technician` port. */
export function createTechnicianService(repositories: TechnicianRepositories): TechnicianService {
  return {
    /** Matches `Api.getTechnician()`/`Api.getTechnicianVehicle()`: "not found" resolves null, never a throw. */
    async findTechnicianById(technicianId) {
      return repositories.technician.findById(technicianId);
    },
  };
}

// Default instance bound to the app's default (memory, for now) repositories
// — preserves today's call sites (flat function imports) untouched.
const defaultTechnicianService = createTechnicianService(defaultRepositories);
export const { findTechnicianById } = defaultTechnicianService;
