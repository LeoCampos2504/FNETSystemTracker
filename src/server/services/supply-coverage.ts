import type { Asset, EquipmentSupplyProfile, MaintenanceEvent, MaintenanceRequirement, StockCoverage, StockRecord } from "@/contracts";

/** FNET derives maintenance needs from its equipment master and official assets. */
export function calculateMaintenanceRequirements(
  profiles: readonly EquipmentSupplyProfile[],
  assets: readonly Asset[],
  maintenanceEvents: readonly MaintenanceEvent[] = [],
): MaintenanceRequirement[] {
  return assets.flatMap((asset) => profiles.filter((profile) => profile.active && profile.assetCategory === asset.category).map((profile) => {
    const event = maintenanceEvents.find((candidate) => candidate.assetId === asset.id);
    return {
      id: `fnet-requirement-${asset.id}-${profile.id}`,
      equipmentSupplyProfileId: profile.id,
      assetCategory: profile.assetCategory,
      maintenanceEventId: event?.id ?? null,
      assetId: asset.id,
      supplyCode: profile.supplyCode,
      description: profile.description,
      quantity: profile.quantity,
      siteId: null,
      zoneId: asset.zoneId,
      dueAt: event?.nextDueAt ?? null,
      source: "FNET" as const,
    };
  }));
}

/** FNET compares its requirement against Intraoperativa stock; no source writes occur. */
export function calculateStockCoverage(requirements: readonly MaintenanceRequirement[], stock: readonly StockRecord[]): StockCoverage[] {
  return requirements.map((requirement) => {
    const availableQuantity = stock.filter((record) => record.supplyCode === requirement.supplyCode && record.zoneId === requirement.zoneId).reduce((total, record) => total + record.quantityAvailable, 0);
    const missingQuantity = Math.max(0, requirement.quantity - availableQuantity);
    return {
      requirementId: requirement.id,
      supplyCode: requirement.supplyCode,
      requiredQuantity: requirement.quantity,
      availableQuantity,
      missingQuantity,
      covered: missingQuantity === 0,
      scopeZoneId: requirement.zoneId,
      calculatedBy: "FNET" as const,
    };
  });
}

export function summarizeMissingQuantity(coverage: readonly StockCoverage[]): number {
  return coverage.reduce((total, item) => total + item.missingQuantity, 0);
}
