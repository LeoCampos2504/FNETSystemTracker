import type { AuditLog } from "@/contracts";
import { repositories } from "@/server/container";

/** Records a mutation. Never pass secrets (passwords, tokens) in before/after. */
export async function recordAudit(
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): Promise<AuditLog> {
  return repositories.audit.append({ actor: actorId, action, entity, entityId, before, after });
}
