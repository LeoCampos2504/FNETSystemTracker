import type { AuditLog } from "@/contracts";

export const mockAuditLogs: AuditLog[] = [
  {
    id: "audit-001",
    actor: "user-coord-1",
    action: "TASK_STATUS_CHANGED",
    entity: "Task",
    entityId: "task-P0006",
    before: { status: "IN_REVIEW" },
    after: { status: "APPROVED" },
    timestamp: "2026-08-18T09:10:00.000Z",
  },
  {
    id: "audit-002",
    actor: "user-coord-2",
    action: "GUARD_REASSIGNED",
    entity: "Guard",
    entityId: "guard-centro-3",
    before: { technicianIds: ["tech-09", "tech-10"] },
    after: { technicianIds: ["tech-09", "tech-05"] },
    timestamp: "2026-08-13T08:00:00.000Z",
  },
];
