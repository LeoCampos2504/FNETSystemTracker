import { mockAuditLogs } from "@/mocks";
import type { AuditRepository } from "@/server/ports";

// Mutated in place for the lifetime of the process; not persisted.
const auditLog = [...mockAuditLogs];

export const auditMemoryRepository: AuditRepository = {
  async append(entry) {
    const record = {
      ...entry,
      id: `audit-${auditLog.length + 1}`.padStart(9, "0"),
      timestamp: new Date().toISOString(),
    };
    auditLog.push(record);
    return record;
  },
  async listByEntity(entity, entityId) {
    return auditLog.filter((a) => a.entity === entity && a.entityId === entityId);
  },
};
