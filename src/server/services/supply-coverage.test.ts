import { describe, expect, it } from "vitest";
import { mockAssets, mockMaintenanceEvents, mockStockRecords } from "@/mocks/assets";
import { mockEquipmentSupplyProfiles } from "@/mocks/fnet-supply";
import { calculateMaintenanceRequirements, calculateStockCoverage, summarizeMissingQuantity } from "./supply-coverage";

describe("FNET supply requirement and coverage calculation", () => {
  it("derives requirements from the FNET equipment supply profile", () => {
    const requirements = calculateMaintenanceRequirements(mockEquipmentSupplyProfiles, mockAssets, mockMaintenanceEvents);
    expect(requirements.length).toBe(2);
    expect(requirements.every((requirement) => requirement.source === "FNET")).toBe(true);
    expect(requirements.some((requirement) => requirement.supplyCode === "FILTER-OIL")).toBe(true);
  });

  it("compares FNET need with Intraoperativa existence and calculates missing quantity", () => {
    const requirements = calculateMaintenanceRequirements(mockEquipmentSupplyProfiles, mockAssets, mockMaintenanceEvents);
    const coverage = calculateStockCoverage(requirements, mockStockRecords);
    expect(coverage.find((item) => item.supplyCode === "FILTER-OIL")?.covered).toBe(true);
    expect(coverage.find((item) => item.supplyCode === "FILTER-AIR")?.missingQuantity).toBe(2);
    expect(summarizeMissingQuantity(coverage)).toBe(2);
    expect(coverage.every((item) => item.calculatedBy === "FNET")).toBe(true);
  });
});
