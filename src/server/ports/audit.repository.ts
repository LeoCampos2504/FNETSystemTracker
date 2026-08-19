import type { AuditLog } from "@/contracts";

export interface AuditRepository {
  append(entry: Omit<AuditLog, "id" | "timestamp">): Promise<AuditLog>;
  listByEntity(entity: string, entityId: string): Promise<AuditLog[]>;
}
