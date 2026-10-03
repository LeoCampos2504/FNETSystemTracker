import type { Organization, OperationalBase, Region, UserScope } from "@/contracts";
import { UserRole } from "@/contracts";

export const mockOrganization: Organization = { id: "org-fnet-ar", code: "FNET-AR", name: "FNET Argentina", countryCode: "AR", active: true };
export const mockRegions: Region[] = [
  { id: "region-north", organizationId: mockOrganization.id, code: "NORTE", name: "Norte", active: true },
  { id: "region-central", organizationId: mockOrganization.id, code: "CENTRO-CUYO", name: "Centro y Cuyo", active: true },
  { id: "region-south", organizationId: mockOrganization.id, code: "PATAGONIA", name: "Patagonia", active: true },
];
export const mockBases: OperationalBase[] = [
  { id: "base-salta", organizationId: mockOrganization.id, regionId: "region-north", zoneId: "zone-noa", code: "BASE-SALTA", name: "Base Salta", city: "Salta", active: true },
  { id: "base-corrientes", organizationId: mockOrganization.id, regionId: "region-north", zoneId: "zone-nea", code: "BASE-COR", name: "Base Corrientes", city: "Corrientes", active: true },
  { id: "base-mendoza", organizationId: mockOrganization.id, regionId: "region-central", zoneId: "zone-cuyo", code: "BASE-MDZ", name: "Base Mendoza", city: "Mendoza", active: true },
  { id: "base-cordoba", organizationId: mockOrganization.id, regionId: "region-central", zoneId: "zone-centro", code: "BASE-CBA", name: "Base Córdoba", city: "Córdoba", active: true },
  { id: "base-neuquen", organizationId: mockOrganization.id, regionId: "region-south", zoneId: "zone-patagonia", code: "BASE-NQN", name: "Base Neuquén", city: "Neuquén", active: true },
];
const grantedAt = "2026-08-01T09:00:00.000Z";
export const mockUserScopes: UserScope[] = [
  { userId: "user-tech-01", role: UserRole.TECHNICIAN, organizationIds: [mockOrganization.id], regionIds: ["region-north"], zoneIds: ["zone-noa"], baseIds: ["base-salta"], technicianId: "tech-01", coordinatorId: null, grantedAt },
  { userId: "user-coord-1", role: UserRole.COORDINATOR, organizationIds: [mockOrganization.id], regionIds: ["region-north"], zoneIds: ["zone-noa", "zone-nea"], baseIds: ["base-salta", "base-corrientes"], technicianId: null, coordinatorId: "coord-1", grantedAt },
  { userId: "user-manager-1", role: UserRole.MANAGER, organizationIds: [mockOrganization.id], regionIds: ["region-north", "region-central"], zoneIds: ["zone-noa", "zone-nea", "zone-cuyo", "zone-centro"], baseIds: ["base-salta", "base-corrientes", "base-mendoza", "base-cordoba"], technicianId: null, coordinatorId: null, grantedAt },
  { userId: "user-admin-1", role: UserRole.ADMIN, organizationIds: [mockOrganization.id], regionIds: mockRegions.map((region) => region.id), zoneIds: ["zone-noa", "zone-nea", "zone-cuyo", "zone-centro", "zone-patagonia"], baseIds: mockBases.map((base) => base.id), technicianId: null, coordinatorId: null, grantedAt },
];
export function mockScopeForRole(role: UserScope["role"]): UserScope { return mockUserScopes.find((scope) => scope.role === role) ?? mockUserScopes[0]; }
export function hierarchyForZone(zoneId: string): Pick<OperationalBase, "organizationId" | "regionId" | "zoneId" | "id"> {
  const base = mockBases.find((item) => item.zoneId === zoneId);
  return { organizationId: mockOrganization.id, regionId: base?.regionId ?? "region-central", zoneId, id: base?.id ?? "base-unknown" };
}

export function scopedResourceForZone(zoneId: string, technicianIds: string[] = []) {
  return { ...hierarchyForZone(zoneId), technicianIds, ownerUserId: null };
}
