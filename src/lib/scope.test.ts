import { describe, expect, it } from "vitest";
import { UserRole } from "@/contracts";
import { mockGuards, mockCrews, mockTechnicians, mockVehicles, mockZones } from "@/mocks";
import { mockScopeForRole, scopedResourceForZone } from "@/mocks/national";
import { createMockSourceAdapters } from "@/server/adapters/mock-source-adapters";
import { filterCrewsForScope, filterGuardsForScope, filterTasksForScope, filterVehiclesForScope, filterZonesForScope, roleLabel, scopeAllowsResource, taskScopeResource } from "./scope";

describe("national role scopes", () => {
  it("technician sees only own tasks, vehicle and asset", async () => {
    const scope = mockScopeForRole(UserRole.TECHNICIAN);
    const adapters = createMockSourceAdapters();
    const tasks = await adapters.sytex.getTasksForScope(scope);
    const vehicles = await adapters.maxtracker.getVehiclesForScope(scope);
    const assets = await adapters.oppen.getAssetsForScope(scope);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => task.assignments.some((assignment) => assignment.technicianId === scope.technicianId))).toBe(true);
    expect(vehicles.every((vehicle) => vehicle.assignedTechnicianId === scope.technicianId)).toBe(true);
    expect(assets.every((asset) => asset.assignedTechnicianId === scope.technicianId)).toBe(true);
  });
  it("coordinator sees zones while manager sees its regions", async () => {
    const adapters = createMockSourceAdapters();
    const coordinatorTasks = await adapters.sytex.getTasksForScope(mockScopeForRole(UserRole.COORDINATOR));
    const managerTasks = await adapters.sytex.getTasksForScope(mockScopeForRole(UserRole.MANAGER));
    expect(new Set(coordinatorTasks.map((task) => task.zoneId))).toEqual(new Set(["zone-noa", "zone-nea"]));
    expect(new Set(managerTasks.map((task) => task.zoneId))).toEqual(new Set(["zone-noa", "zone-nea", "zone-cuyo", "zone-centro"]));
  });
  it("derives coordinator and manager visibility from the active UserScope", async () => {
    const tasks = (await createMockSourceAdapters().sytex.getTasksForScope(mockScopeForRole(UserRole.ADMIN)));
    const coordinatorScope = mockScopeForRole(UserRole.COORDINATOR);
    const managerScope = mockScopeForRole(UserRole.MANAGER);
    const alternateCoordinatorScope = { ...coordinatorScope, zoneIds: ["zone-patagonia"], baseIds: ["base-neuquen"], regionIds: ["region-south"] };
    const alternateManagerScope = { ...managerScope, zoneIds: ["zone-patagonia"], baseIds: ["base-neuquen"], regionIds: ["region-south"] };
    const coordinatorTasks = filterTasksForScope(tasks, coordinatorScope);
    const managerTasks = filterTasksForScope(tasks, managerScope);
    const alternateCoordinatorTasks = filterTasksForScope(tasks, alternateCoordinatorScope);
    const alternateManagerTasks = filterTasksForScope(tasks, alternateManagerScope);
    expect(alternateCoordinatorTasks.length).toBeGreaterThan(0);
    expect(alternateManagerTasks.length).toBeGreaterThan(0);
    expect(new Set(alternateCoordinatorTasks.map((task) => task.zoneId))).toEqual(new Set(["zone-patagonia"]));
    expect(new Set(alternateManagerTasks.map((task) => task.zoneId))).toEqual(new Set(["zone-patagonia"]));
    expect(alternateCoordinatorTasks.length).not.toBe(coordinatorTasks.length);
    expect(alternateManagerTasks.length).not.toBe(managerTasks.length);
  });
  it("uses the centralized role label for every role", () => {
    expect(roleLabel(UserRole.TECHNICIAN)).toBe("Técnico");
    expect(roleLabel(UserRole.COORDINATOR)).toBe("Coordinador");
    expect(roleLabel(UserRole.MANAGER)).toBe("Gerente");
    expect(roleLabel(UserRole.ADMIN)).toBe("Administrador");
  });
  it("does not require a known fixture zone id to authorize a scoped task", () => {
    const scope = { ...mockScopeForRole(UserRole.MANAGER), zoneIds: ["zone-external"], baseIds: [], regionIds: ["region-south"] };
    const task = taskScopeResource({ id: "task-external", zoneId: "zone-external", regionId: "region-south", assignments: [] });
    expect(scopeAllowsResource(scope, task)).toBe(true);
  });
  it("admin sees global scope and unknown resources fail closed", async () => {
    const adapters = createMockSourceAdapters();
    expect((await adapters.sytex.getTasksForScope(mockScopeForRole(UserRole.ADMIN))).length).toBeGreaterThan(20);
    expect(scopeAllowsResource(mockScopeForRole(UserRole.COORDINATOR), { zoneId: "zone-unknown" })).toBe(false);
  });
  it("scopes vehicles, guards, zones and crews from the active UserScope", () => {
    const technicianScope = mockScopeForRole(UserRole.TECHNICIAN);
    const coordinatorScope = mockScopeForRole(UserRole.COORDINATOR);
    const managerScope = mockScopeForRole(UserRole.MANAGER);
    const adminScope = mockScopeForRole(UserRole.ADMIN);
    const technicianVehicles = filterVehiclesForScope(mockVehicles, mockTechnicians, technicianScope, scopedResourceForZone);
    const technicianGuards = filterGuardsForScope(mockGuards, technicianScope, scopedResourceForZone);
    const technicianCrews = filterCrewsForScope(mockCrews, technicianScope);
    const technicianZones = filterZonesForScope(mockZones, technicianScope);
    expect(technicianVehicles.every((vehicle) => vehicle.assignedTechnicianId === technicianScope.technicianId)).toBe(true);
    expect(technicianGuards.every((guard) => guard.technicianIds.includes(technicianScope.technicianId!))).toBe(true);
    expect(technicianCrews.every((crew) => [crew.primaryId, crew.collaboratorId, crew.floaterId].includes(technicianScope.technicianId!))).toBe(true);
    expect(technicianZones.every((zone) => technicianScope.zoneIds.includes(zone.id))).toBe(true);

    const coordinatorVehicles = filterVehiclesForScope(mockVehicles, mockTechnicians, coordinatorScope, scopedResourceForZone);
    const coordinatorGuards = filterGuardsForScope(mockGuards, coordinatorScope, scopedResourceForZone);
    const coordinatorCrews = filterCrewsForScope(mockCrews, coordinatorScope);
    expect(coordinatorVehicles.every((vehicle) => {
      const technician = mockTechnicians.find((item) => item.id === vehicle.assignedTechnicianId);
      return technician ? coordinatorScope.zoneIds.includes(technician.onLoanZoneId ?? technician.primaryZoneId) : false;
    })).toBe(true);
    expect(coordinatorGuards.every((guard) => coordinatorScope.zoneIds.includes(guard.zoneId))).toBe(true);
    expect(coordinatorCrews.every((crew) => coordinatorScope.zoneIds.includes(crew.zoneId))).toBe(true);

    expect(filterZonesForScope(mockZones, managerScope).length).toBeGreaterThan(filterZonesForScope(mockZones, coordinatorScope).length);
    expect(filterVehiclesForScope(mockVehicles, mockTechnicians, adminScope, scopedResourceForZone)).toHaveLength(mockVehicles.length);
    expect(filterGuardsForScope(mockGuards, adminScope, scopedResourceForZone)).toHaveLength(mockGuards.length);
    expect(filterCrewsForScope(mockCrews, adminScope)).toHaveLength(mockCrews.length);
    expect(filterZonesForScope(mockZones, adminScope)).toHaveLength(mockZones.length);
  });
  it("changing UserScope changes every visible collection without relying on fixture position", () => {
    const patagoniaScope = { ...mockScopeForRole(UserRole.COORDINATOR), regionIds: ["region-south"], zoneIds: ["zone-patagonia"], baseIds: ["base-neuquen"] };
    const zones = filterZonesForScope(mockZones, patagoniaScope);
    const crews = filterCrewsForScope(mockCrews, patagoniaScope);
    const guards = filterGuardsForScope(mockGuards, patagoniaScope, scopedResourceForZone);
    const vehicles = filterVehiclesForScope(mockVehicles, mockTechnicians, patagoniaScope, scopedResourceForZone);
    expect(zones.map((zone) => zone.id)).toEqual(["zone-patagonia"]);
    expect(crews.every((crew) => crew.zoneId === "zone-patagonia")).toBe(true);
    expect(guards.every((guard) => guard.zoneId === "zone-patagonia")).toBe(true);
    expect(vehicles.every((vehicle) => vehicle.assignedTechnicianId === "tech-12")).toBe(true);
  });
});
