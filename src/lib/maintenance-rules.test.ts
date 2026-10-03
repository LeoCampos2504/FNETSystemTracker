import { describe, expect, it } from "vitest";
import { calculateNextMaintenanceDate, maintenanceDueStatus } from "./maintenance-rules";
describe("maintenance intervals", () => {
  it("supports 6, 12 and 24 month intervals", () => {
    expect(calculateNextMaintenanceDate("2026-01-15T12:00:00Z", 6)).toContain("2026-07-15");
    expect(calculateNextMaintenanceDate("2026-01-15T12:00:00Z", 12)).toContain("2027-01-15");
    expect(calculateNextMaintenanceDate("2026-01-15T12:00:00Z", 24)).toContain("2028-01-15");
  });
  it("derives due status without persistence", () => {
    const asOf = new Date("2026-08-18T12:00:00Z");
    expect(maintenanceDueStatus("2026-08-01T12:00:00Z", asOf)).toBe("VENCIDO");
    expect(maintenanceDueStatus("2026-08-30T12:00:00Z", asOf)).toBe("VENCE_ESTE_MES");
  });
});
