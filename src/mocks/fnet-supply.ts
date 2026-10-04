import type { EquipmentSupplyProfile } from "@/contracts";
import { AssetCategory } from "@/contracts";

/** FNET-owned master: Intraoperativa never supplies this requirement definition. */
export const mockEquipmentSupplyProfiles: EquipmentSupplyProfile[] = [
  { id: "profile-ge-oil-filter", assetCategory: AssetCategory.GENERATOR, supplyCode: "FILTER-OIL", description: "Filtro de aceite", quantity: 1, intervalMonths: 6, active: true },
  { id: "profile-aa-air-filter", assetCategory: AssetCategory.AIR_CONDITIONER, supplyCode: "FILTER-AIR", description: "Filtro de aire", quantity: 2, intervalMonths: 6, active: true },
];
