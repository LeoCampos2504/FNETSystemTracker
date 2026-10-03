import { describe, expect, it } from "vitest";
import { mockAssets, mockAssetAssignments } from "@/mocks/assets";
import { reassignAsset } from "./asset-assignment";
describe("asset assignment history", () => {
  it("supports reassignment without losing the previous assignment", () => {
    const result = reassignAsset(mockAssets[0], mockAssetAssignments, "BASE", "base-salta", "user-manager-1", "2026-09-01T08:00:00Z");
    expect(result.asset.assignedTechnicianId).toBeNull();
    expect(result.history).toHaveLength(2);
    expect(result.history[0].unassignedAt).toBe("2026-09-01T08:00:00Z");
    expect(result.history[1].targetType).toBe("BASE");
  });
});
