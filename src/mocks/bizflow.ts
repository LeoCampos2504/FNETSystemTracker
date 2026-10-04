import type { BizFlowResource, EmploymentRecord, LeaveRecord, WorkdayRecord } from "@/contracts";
import { ExternalSource, WorkdayStatus } from "@/contracts";
import { mockTechnicians } from "./technicians";

const syncFields = { externalSource: ExternalSource.BIZFLOW, sourceUpdatedAt: "2026-08-18T18:00:00.000Z" };

export const mockBizFlowResources: BizFlowResource[] = mockTechnicians.map((technician) => ({
  id: `bf-resource-${technician.id}`,
  technicianId: technician.id,
  resourceType: "TECHNICIAN",
  active: technician.active,
  zoneId: technician.onLoanZoneId ?? technician.primaryZoneId,
  externalId: technician.externalId,
  ...syncFields,
}));

export const mockWorkdayRecords: WorkdayRecord[] = [
  { id: "bf-workday-tech-01-2026-08-18", resourceId: "tech-01", date: "2026-08-18", loginAt: "2026-08-18T07:54:00", workdayStartedAt: "2026-08-18T08:00:00", workdayEndedAt: "2026-08-18T17:58:00", source: "BIZFLOW", technicianId: "tech-01", workDate: "2026-08-18", loggedInAt: "2026-08-18T07:54:00", startedAt: "2026-08-18T08:00:00", finishedAt: "2026-08-18T17:58:00", loggedOutAt: "2026-08-18T18:01:00", status: WorkdayStatus.COMPLETED, externalId: "BF-WORKDAY-001", ...syncFields },
  { id: "bf-workday-tech-02-2026-08-18", resourceId: "tech-02", date: "2026-08-18", loginAt: "2026-08-18T07:57:00", workdayStartedAt: "2026-08-18T08:04:00", workdayEndedAt: null, source: "BIZFLOW", technicianId: "tech-02", workDate: "2026-08-18", loggedInAt: "2026-08-18T07:57:00", startedAt: "2026-08-18T08:04:00", finishedAt: null, loggedOutAt: null, status: WorkdayStatus.ACTIVE, externalId: "BF-WORKDAY-002", ...syncFields },
];

export const mockLeaveRecords: LeaveRecord[] = [
  { id: "bf-vacation-tech-04", resourceId: "tech-04", startAt: "2026-09-01T00:00:00", endAt: "2026-09-10T23:59:59.999", source: "BIZFLOW", technicianId: "tech-04", type: "VACATION", startDate: "2026-09-01", endDate: "2026-09-10", status: "APPROVED", reason: null, externalId: "BF-LEAVE-001", ...syncFields },
  { id: "bf-license-tech-05", resourceId: "tech-05", startAt: "2026-08-20T00:00:00", endAt: "2026-08-22T23:59:59.999", source: "BIZFLOW", technicianId: "tech-05", type: "LICENSE", startDate: "2026-08-20", endDate: "2026-08-22", status: "APPROVED", reason: "Licencia médica", externalId: "BF-LEAVE-002", ...syncFields },
];

export const mockEmploymentRecords: EmploymentRecord[] = [
  { id: "bf-employment-tech-01", technicianId: "tech-01", status: "ACTIVE", effectiveFrom: "2024-01-01", effectiveTo: null, externalId: "BF-EMP-001", ...syncFields },
  { id: "bf-employment-tech-05", technicianId: "tech-05", status: "ON_LEAVE", effectiveFrom: "2026-08-20", effectiveTo: "2026-08-22", externalId: "BF-EMP-002", ...syncFields },
];
