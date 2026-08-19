import type { User } from "@/contracts";
import { UserRole } from "@/contracts";
import { mockCoordinators } from "./coordinators";
import { mockTechnicians } from "./technicians";

/**
 * Demo password for every mock user is "demo1234". mock-api does not
 * actually verify it (see `src/lib/api/mock-api.ts`); this only exists so
 * a real bcrypt-backed check can be dropped in later without changing shape.
 */
export const MOCK_DEMO_PASSWORD = "demo1234";

const adminUser: User = {
  id: "user-admin-1",
  email: "admin@fnet.local",
  name: "Admin FNET",
  role: UserRole.ADMIN,
  technicianId: null,
  coordinatorId: null,
  active: true,
};

const coordinatorUsers: User[] = mockCoordinators.map((coordinator) => ({
  id: coordinator.userId ?? `user-${coordinator.id}`,
  email: `${coordinator.id}@fnet.local`,
  name: coordinator.name,
  role: UserRole.COORDINATOR,
  technicianId: null,
  coordinatorId: coordinator.id,
  active: true,
}));

const technicianUsers: User[] = mockTechnicians.map((technician) => ({
  id: technician.userId ?? `user-${technician.id}`,
  email: `${technician.id}@fnet.local`,
  name: technician.name,
  role: UserRole.TECHNICIAN,
  technicianId: technician.id,
  coordinatorId: null,
  active: technician.active,
}));

export const mockUsers: User[] = [adminUser, ...coordinatorUsers, ...technicianUsers];
