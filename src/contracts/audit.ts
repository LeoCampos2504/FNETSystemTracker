/**
 * Audit trail contract for future mutations. `before`/`after` are opaque
 * snapshots of the entity's shape at that point — never assume a specific
 * contract type here, since audited entities vary.
 */
export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  timestamp: string;
}
