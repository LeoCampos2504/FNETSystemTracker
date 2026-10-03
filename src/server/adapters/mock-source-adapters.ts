import type { Asset, BizFlowResource, EmploymentRecord, GuardDuty, GuardDutySegment, LeaveRecord, MaintenanceEvent, StockMovement, StockRecord, Task, Technician, UserScope, Vehicle, WorkdayRecord } from "@/contracts";
import { ExternalSource } from "@/contracts";
import { filterForScope, filterGuardsForScope, filterVehiclesForScope } from "@/lib/scope";
import { mockAssets, mockMaintenanceEvents, mockStockMovements, mockStockRecords } from "@/mocks/assets";
import { mockGuards } from "@/mocks/guards";
import { hierarchyForZone, scopedResourceForZone } from "@/mocks/national";
import { mockTasks } from "@/mocks/tasks";
import { mockTechnicians } from "@/mocks/technicians";
import { mockVehicles } from "@/mocks/vehicles";
import { mockBizFlowResources, mockEmploymentRecords, mockLeaveRecords, mockWorkdayRecords } from "@/mocks/bizflow";
import type { BizFlowAdapter, IntraoperativaAdapter, MaxTrackerAdapter, OppenAdapter, SytexAdapter } from "@/contracts/source-adapters";
import { buildGuardSegments } from "@/lib/guard-duty-rules";

export class MockSytexAdapter implements SytexAdapter {
  readonly source = "SYTEX" as const;
  async getTasksForScope(scope: UserScope): Promise<readonly Task[]> {
    return mockTasks.filter((task) => filterForScope([scopedResourceForZone(task.zoneId, task.assignments.map((item) => item.technicianId))], scope).length > 0);
  }
  async getMaintenanceForScope(scope: UserScope): Promise<readonly MaintenanceEvent[]> {
    return mockMaintenanceEvents.filter((event) => {
      const asset = mockAssets.find((item) => item.id === event.assetId);
      return asset ? filterForScope([asset], scope).length > 0 : false;
    });
  }
}

export class MockBizFlowAdapter implements BizFlowAdapter {
  readonly source = "BIZFLOW" as const;
  async getResourcesForScope(scope: UserScope): Promise<readonly BizFlowResource[]> {
    return mockBizFlowResources.filter((resource) => filterForScope([scopedResourceForZone(resource.zoneId, [resource.technicianId])], scope).length > 0);
  }
  async getTechniciansForScope(scope: UserScope): Promise<readonly Technician[]> {
    return mockTechnicians.filter((technician) => filterForScope([scopedResourceForZone(technician.onLoanZoneId ?? technician.primaryZoneId, [technician.id])], scope).length > 0);
  }
  async getGuardDutiesForScope(scope: UserScope): Promise<readonly GuardDuty[]> {
    return filterGuardsForScope(mockGuards, scope, scopedResourceForZone)
      .map((guard) => {
        const hierarchy = hierarchyForZone(guard.zoneId);
        return { id: guard.id, organizationId: hierarchy.organizationId, regionId: hierarchy.regionId, zoneId: guard.zoneId, baseId: hierarchy.id, startAt: guard.startAt, endAt: guard.endAt, status: "PLANNED" as const, externalId: guard.externalId, externalSource: ExternalSource.BIZFLOW, sourceUpdatedAt: guard.sourceUpdatedAt };
      });
  }
  async getGuardSegmentsForScope(scope: UserScope): Promise<readonly GuardDutySegment[]> {
    const guards = await this.getGuardDutiesForScope(scope);
    return guards.flatMap((guard) => {
      const fixture = mockGuards.find((item) => item.id === guard.id);
      if (!fixture) return [];
      return buildGuardSegments(guard.id, guard.startAt, guard.endAt, fixture.technicianIds).segments;
    });
  }
  async getWorkdaysForScope(scope: UserScope): Promise<readonly WorkdayRecord[]> {
    const resources = await this.getResourcesForScope(scope);
    const ids = new Set(resources.map((resource) => resource.technicianId));
    return mockWorkdayRecords.filter((record) => ids.has(record.technicianId));
  }
  async getLeavesForScope(scope: UserScope): Promise<readonly LeaveRecord[]> {
    const resources = await this.getResourcesForScope(scope);
    const ids = new Set(resources.map((resource) => resource.technicianId));
    return mockLeaveRecords.filter((record) => ids.has(record.technicianId));
  }
  async getEmploymentForScope(scope: UserScope): Promise<readonly EmploymentRecord[]> {
    const resources = await this.getResourcesForScope(scope);
    const ids = new Set(resources.map((resource) => resource.technicianId));
    return mockEmploymentRecords.filter((record) => ids.has(record.technicianId));
  }
}

export class MockMaxTrackerAdapter implements MaxTrackerAdapter {
  readonly source = "MAXTRACKER" as const;
  async getVehiclesForScope(scope: UserScope): Promise<readonly Vehicle[]> {
    return filterVehiclesForScope(mockVehicles, mockTechnicians, scope, scopedResourceForZone);
  }
}

export class MockIntraoperativaAdapter implements IntraoperativaAdapter {
  readonly source = "INTRAOPERATIVA" as const;
  async getStockRecordsForScope(scope: UserScope): Promise<readonly StockRecord[]> {
    return mockStockRecords.filter((record) => filterForScope([record], scope).length > 0);
  }
  async getStockMovementsForScope(scope: UserScope): Promise<readonly StockMovement[]> {
    return mockStockMovements.filter((movement) => filterForScope([movement], scope).length > 0);
  }
}

export class MockOppenAdapter implements OppenAdapter {
  readonly source = "OPPEN" as const;
  async getAssetsForScope(scope: UserScope): Promise<readonly Asset[]> { return filterForScope(mockAssets, scope); }
}

export function createMockSourceAdapters() {
  return { sytex: new MockSytexAdapter(), bizflow: new MockBizFlowAdapter(), maxtracker: new MockMaxTrackerAdapter(), intraoperativa: new MockIntraoperativaAdapter(), oppen: new MockOppenAdapter() };
}
