import type { AuditLog } from "@/contracts";
import type { BackendRepositories } from "@/server/ports";
import { repositories as defaultRepositories } from "@/server/container";

export interface AuditService {
  recordAudit(
    actorId: string,
    action: string,
    entity: string,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Promise<AuditLog>;
}

/** Pure factory: depends only on the `audit` port, never on a concrete repository implementation. */
export function createAuditService(repositories: Pick<BackendRepositories, "audit">): AuditService {
  return {
    /** Records a mutation. Never pass secrets (passwords, tokens) in before/after. */
    async recordAudit(actorId, action, entity, entityId, before, after) {
      return repositories.audit.append({ actor: actorId, action, entity, entityId, before, after });
    },
  };
}

// Default instance bound to the app's default (memory, for now) repositories
// — this is what every other service/route gets when it imports `recordAudit`
// directly, preserving today's call sites untouched. Swapping the backing
// implementation later only means changing what `repositories` in
// `@/server/container` points to; this file needs no changes.
const defaultAuditService = createAuditService(defaultRepositories);
export const { recordAudit } = defaultAuditService;
