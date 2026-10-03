import type { Asset } from "./asset";
import type { BizFlowResource, EmploymentRecord, LeaveRecord, WorkdayRecord } from "./bizflow";
import type { GuardDuty, GuardDutySegment } from "./guard-duty";
import type { MaintenanceEvent, StockMovement, StockRecord } from "./maintenance";
import type { UserScope } from "./organization";
import type { Task } from "./task";
import type { Technician } from "./technician";
import type { Vehicle } from "./vehicle";

export type SourceOwnership = "SYTEX" | "BIZFLOW" | "MAXTRACKER" | "INTRAOPERATIVA" | "OPPEN";

export interface ScopedReadAdapter<T> {
  readonly source: SourceOwnership;
  getForScope(scope: UserScope): Promise<readonly T[]>;
}

export interface SytexAdapter {
  readonly source: "SYTEX";
  getTasksForScope(scope: UserScope): Promise<readonly Task[]>;
  getMaintenanceForScope(scope: UserScope): Promise<readonly MaintenanceEvent[]>;
}

export interface BizFlowAdapter {
  readonly source: "BIZFLOW";
  getResourcesForScope(scope: UserScope): Promise<readonly BizFlowResource[]>;
  getTechniciansForScope(scope: UserScope): Promise<readonly Technician[]>;
  getGuardDutiesForScope(scope: UserScope): Promise<readonly GuardDuty[]>;
  getGuardSegmentsForScope(scope: UserScope): Promise<readonly GuardDutySegment[]>;
  getWorkdaysForScope(scope: UserScope): Promise<readonly WorkdayRecord[]>;
  getLeavesForScope(scope: UserScope): Promise<readonly LeaveRecord[]>;
  getEmploymentForScope(scope: UserScope): Promise<readonly EmploymentRecord[]>;
}

export interface MaxTrackerAdapter {
  readonly source: "MAXTRACKER";
  getVehiclesForScope(scope: UserScope): Promise<readonly Vehicle[]>;
}

export interface IntraoperativaAdapter {
  readonly source: "INTRAOPERATIVA";
  getStockRecordsForScope(scope: UserScope): Promise<readonly StockRecord[]>;
  getStockMovementsForScope(scope: UserScope): Promise<readonly StockMovement[]>;
}

export interface OppenAdapter {
  readonly source: "OPPEN";
  getAssetsForScope(scope: UserScope): Promise<readonly Asset[]>;
}
