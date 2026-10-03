import type { Asset, AssetAssignment, AssetAssignmentTarget } from "@/contracts";

export function reassignAsset(
  asset: Asset,
  history: readonly AssetAssignment[],
  targetType: AssetAssignmentTarget,
  targetId: string | null,
  actorUserId: string | null,
  changedAt: string,
): { asset: Asset; history: AssetAssignment[] } {
  const closedHistory = history.map((entry) => entry.unassignedAt ? entry : { ...entry, unassignedAt: changedAt });
  const nextAssignment: AssetAssignment = {
    id: `${asset.id}-${changedAt}`,
    assetId: asset.id,
    targetType,
    targetId,
    assignedAt: changedAt,
    unassignedAt: null,
    actorUserId,
    reason: null,
  };
  return {
    asset: { ...asset, assignedTechnicianId: targetType === "USER" ? targetId : null },
    history: [...closedHistory, nextAssignment],
  };
}
