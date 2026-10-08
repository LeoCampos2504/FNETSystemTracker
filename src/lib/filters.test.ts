import { describe, expect, it } from "vitest";
import { inDateRange, mergeSubZones, monthWeeks, placeMatches, rangeLabel, taskDay, weekRange } from "./filters";

describe("zone and sub-zone checkboxes", () => {
  it("lets everything through with nothing ticked", () => {
    expect(placeMatches("NOA", "Metán", [])).toBe(true);
  });
  it("matches a whole zone or only the ticked sub-zones, ignoring accents and case", () => {
    expect(placeMatches("NOA", "Orán", ["NOA"])).toBe(true);
    expect(placeMatches("NOA", "METAN", ["NOA|Metán", "BAS|General Pico"])).toBe(true);
    expect(placeMatches("NOA", "Orán", ["NOA|Metán"])).toBe(false);
    expect(placeMatches("BAM", "Chivilcoy", ["NOA|Metán"])).toBe(false);
  });
  it("keeps the records without sub-zone only when 'Sin subzona' is ticked", () => {
    expect(placeMatches("NOA", null, ["NOA|Metán"])).toBe(false);
    expect(placeMatches("NOA", null, ["NOA|"])).toBe(true);
  });
  it("uses the zone alone on screens that do not know sub-zones", () => {
    expect(placeMatches("NOA", undefined, ["NOA|Metán"])).toBe(true);
    expect(placeMatches("BAM", undefined, ["NOA|Metán"])).toBe(false);
  });
  it("collects sub-zones once per zone", () => {
    const first = mergeSubZones({}, [{ zone: "NOA", subZone: "Metán" }, { zone: "NOA", subZone: "METAN" }, { zone: "NOA", subZone: "Jujuy" }, { zone: "BAM", subZone: null }]);
    expect(first).toEqual({ NOA: ["Jujuy", "Metán"], BAM: [""] });
    expect(mergeSubZones(first!, [{ zone: "NOA", subZone: "jujuy" }])).toBeNull();
  });
});

describe("calendar range", () => {
  it("filters inclusive days and leaves records without date out", () => {
    const range = { from: "2026-10-01", to: "2026-10-08" };
    expect(inDateRange("2026-10-08T21:00:00.000Z", range)).toBe(true);
    expect(inDateRange("2026-09-30", range)).toBe(false);
    expect(inDateRange(null, range)).toBe(false);
    expect(inDateRange(null, { from: "", to: "" })).toBe(true);
  });
  it("names days, months and ranges", () => {
    expect(rangeLabel({ from: "", to: "" })).toBe("Todas las fechas");
    expect(rangeLabel({ from: "2026-10-08", to: "2026-10-08" })).toBe("8 oct 2026");
    expect(rangeLabel({ from: "2026-10-01", to: "2026-10-31" })).toBe("Octubre 2026");
    expect(rangeLabel({ from: "2026-09-28", to: "2026-10-04" })).toBe("28 sep 2026 – 4 oct 2026");
  });
  it("lays out months from Monday and finds the week of a day", () => {
    const weeks = monthWeeks("2026-10");
    expect(weeks[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(weekRange("2026-10-08")).toEqual({ from: "2026-10-05", to: "2026-10-11" });
  });
  it("counts a done task on the day it was done and an open one on its plan date", () => {
    expect(taskDay({ completedDate: "2026-10-03", scheduledDate: "2026-09-30" })).toBe("2026-10-03");
    expect(taskDay({ completedDate: null, scheduledDate: "2026-09-30" })).toBe("2026-09-30");
  });
});
