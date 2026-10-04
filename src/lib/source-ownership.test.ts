import { describe, expect, it } from "vitest";
import { UserRole } from "@/contracts";
import { mockScopeForRole } from "@/mocks/national";
import { createMockSourceAdapters } from "@/server/adapters/mock-source-adapters";
describe("source ownership boundaries", () => {
  it("keeps each domain behind its declared adapter", () => {
    const adapters = createMockSourceAdapters();
    expect(adapters.sytex.source).toBe("SYTEX");
    expect(adapters.bizflow.source).toBe("BIZFLOW");
    expect(adapters.maxtracker.source).toBe("MAXTRACKER");
    expect(adapters.intraoperativa.source).toBe("INTRAOPERATIVA");
    expect(adapters.oppen.source).toBe("OPPEN");
  });
  it("uses BizFlow for guards, resources and workday records", async () => {
    const adapter = createMockSourceAdapters().bizflow;
    const scope = mockScopeForRole(UserRole.ADMIN);
    expect((await adapter.getResourcesForScope(scope)).length).toBeGreaterThan(0);
    expect((await adapter.getGuardDutiesForScope(scope)).length).toBeGreaterThan(0);
    expect((await adapter.getWorkdaysForScope(scope)).every((record) => record.externalSource === "BIZFLOW")).toBe(true);
  });
  it("uses BizFlow for vacations, licenses and employment status", async () => {
    const adapter = createMockSourceAdapters().bizflow;
    const scope = mockScopeForRole(UserRole.ADMIN);
    expect((await adapter.getLeavesForScope(scope)).map((record) => record.type)).toEqual(expect.arrayContaining(["VACATION", "LICENSE"]));
    expect((await adapter.getEmploymentForScope(scope)).every((record) => record.externalSource === "BIZFLOW")).toBe(true);
  });
  it("uses Intraoperativa for stock and movements only", async () => {
    const adapter = createMockSourceAdapters().intraoperativa;
    const scope = mockScopeForRole(UserRole.TECHNICIAN);
    const stock = await adapter.getStockRecordsForScope(scope);
    const movements = await adapter.getStockMovementsForScope(scope);
    expect(stock.every((entry) => entry.source === "INTRAOPERATIVA")).toBe(true);
    expect(movements.every((entry) => entry.source === "INTRAOPERATIVA")).toBe(true);
  });
  it("keeps Intraoperativa limited to stock and materials, not workday or guards", () => {
    const intraoperativa = createMockSourceAdapters().intraoperativa as unknown as Record<string, unknown>;
    expect("getWorkdaysForScope" in intraoperativa).toBe(false);
    expect("getWorkingHoursForScope" in intraoperativa).toBe(false);
    expect("getGuardDutiesForScope" in intraoperativa).toBe(false);
    expect("getSupplyRequirementsForScope" in intraoperativa).toBe(false);
    expect("getStockRecordsForScope" in intraoperativa).toBe(true);
    expect("getStockMovementsForScope" in intraoperativa).toBe(true);
  });
  it("keeps forms/tasks in Sytex and does not expose official stock there", async () => {
    const sytex = createMockSourceAdapters().sytex as unknown as Record<string, unknown>;
    expect("getTasksForScope" in sytex).toBe(true);
    expect("getSupplyRequirementsForScope" in sytex).toBe(false);
    const tasks = await createMockSourceAdapters().sytex.getTasksForScope(mockScopeForRole(UserRole.ADMIN));
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => task.externalSource === "SYTEX")).toBe(true);
  });
  it("keeps Oppen assets separate from Intraoperativa stock", async () => {
    const adapters = createMockSourceAdapters();
    const assets = await adapters.oppen.getAssetsForScope(mockScopeForRole(UserRole.ADMIN));
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.every((asset) => asset.externalSource === "OPPEN")).toBe(true);
    expect("getAssetsForScope" in (adapters.intraoperativa as unknown as Record<string, unknown>)).toBe(false);
  });
});
