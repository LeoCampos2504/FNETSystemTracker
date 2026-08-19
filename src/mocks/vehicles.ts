import type { Vehicle, VehicleAssignment } from "@/contracts";
import { ExternalSource, VehicleStatus } from "@/contracts";

interface VehicleSeed {
  id: string;
  plate: string;
  brand: string;
  model: string;
  mileageKm: number;
  status: VehicleStatus;
  assignedTechnicianId: string | null;
}

const seeds: VehicleSeed[] = [
  { id: "veh-01", plate: "AB101CD", brand: "Toyota", model: "Hilux", mileageKm: 68500, status: VehicleStatus.ACTIVE, assignedTechnicianId: "tech-01" },
  { id: "veh-02", plate: "AB102CD", brand: "Toyota", model: "Hilux", mileageKm: 71230, status: VehicleStatus.ACTIVE, assignedTechnicianId: "tech-04" },
  { id: "veh-03", plate: "AB103CD", brand: "Volkswagen", model: "Amarok", mileageKm: 54300, status: VehicleStatus.ACTIVE, assignedTechnicianId: "tech-06" },
  { id: "veh-04", plate: "AB104CD", brand: "Renault", model: "Kangoo", mileageKm: 39800, status: VehicleStatus.ACTIVE, assignedTechnicianId: "tech-09" },
  { id: "veh-05", plate: "AB105CD", brand: "Toyota", model: "Hilux", mileageKm: 82100, status: VehicleStatus.ACTIVE, assignedTechnicianId: "tech-12" },
  { id: "veh-06", plate: "AB106CD", brand: "Fiat", model: "Strada", mileageKm: 45600, status: VehicleStatus.ACTIVE, assignedTechnicianId: "tech-03" },
  { id: "veh-07", plate: "AB107CD", brand: "Renault", model: "Kangoo", mileageKm: 91200, status: VehicleStatus.MAINTENANCE, assignedTechnicianId: "tech-08" },
  { id: "veh-08", plate: "AB108CD", brand: "Volkswagen", model: "Amarok", mileageKm: 103400, status: VehicleStatus.OUT_OF_SERVICE, assignedTechnicianId: null },
];

export const mockVehicles: Vehicle[] = seeds.map((seed) => ({
  ...seed,
  externalId: `MT-VEH-${seed.id.slice(-2)}`,
  externalSource: ExternalSource.MAXTRACKER,
  sourceUpdatedAt: "2026-08-17T18:00:00.000Z",
}));

export const mockVehicleAssignments: VehicleAssignment[] = [
  { id: "va-01", vehicleId: "veh-01", technicianId: "tech-01", startAt: "2026-06-01T08:00:00.000Z", endAt: null },
  { id: "va-02", vehicleId: "veh-04", technicianId: "tech-11", startAt: "2026-03-01T08:00:00.000Z", endAt: "2026-07-15T08:00:00.000Z" },
  { id: "va-03", vehicleId: "veh-04", technicianId: "tech-09", startAt: "2026-07-15T08:00:00.000Z", endAt: null },
];
