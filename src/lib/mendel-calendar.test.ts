import { describe, expect, it } from "vitest";
import { monthDays, orderedRange, shiftMonth } from "./mendel-calendar";
import { EMPTY_TRAY_FILTERS, filterTray, trayDateKey, type TrayRow } from "./mendel-bandeja";
describe("Mendel calendar civil dates", () => {
  it("includes leap day and a Monday-first grid", () => { const days = monthDays("2028-02"); expect(days[0]).toBe(null); expect(days[1]).toBe("2028-02-01"); expect(days).toContain("2028-02-29"); expect(days).not.toContain("2028-02-30"); });
  it("navigates across years without local timezone arithmetic", () => { expect(shiftMonth("2026-12", 1)).toBe("2027-01"); expect(shiftMonth("2026-01", -1)).toBe("2025-12"); });
  it("supports one day and reverse range selection", () => { expect(orderedRange("2026-10-20", "2026-10-02")).toEqual({ from: "2026-10-02", to: "2026-10-20" }); expect(orderedRange("2026-10-02", "2026-10-02").to).toBe("2026-10-02"); });
  it("keeps Argentina instant/civil semantics and inclusive bounds", () => { expect(trayDateKey("2026-08-18T01:30:00Z")).toBe("2026-08-17"); const r = { key: "x", date: "18/08/2026", notes: "", approvalNotes: "", person: "Árbol", merchant: "Comercio", budget: "", transactionId: "1", zone: "NOA" } as TrayRow; expect(filterTray([r], { ...EMPTY_TRAY_FILTERS, query: "arbol", zone: "NOA", from: "2026-08-18", to: "2026-08-18" })).toHaveLength(1); });
});
