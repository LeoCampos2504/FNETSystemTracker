import { describe, expect, it } from "vitest";
import { TaskStatus } from "@/contracts";
import { displayDate, isUnfinished, sortTasksForDisplay, sytexLink } from "./task-order";

const task = (code: string, status: TaskStatus, scheduledDate: string, scheduledAt: string | null = scheduledDate === "sin-fecha" ? null : scheduledDate + "T00:00:00.000Z", requestDate: string | null = null) => ({ code, status, scheduledDate, scheduledAt, requestDate });

describe("task order", () => {
  it("puts unfinished tasks before approved ones, most recent first inside each group", () => {
    const sorted = sortTasksForDisplay([
      task("approved-new", TaskStatus.APPROVED, "2026-10-04"),
      task("open-old", TaskStatus.OPEN, "2026-09-01"),
      task("progress-new", TaskStatus.IN_PROGRESS, "2026-10-03"),
      task("cancelled", TaskStatus.CANCELLED, "2026-10-05"),
      task("review", TaskStatus.IN_REVIEW, "2026-10-02"),
      task("approved-old", TaskStatus.APPROVED, "2026-08-01"),
    ]).map((item) => item.code);
    expect(sorted).toEqual(["progress-new", "open-old", "review", "approved-new", "approved-old", "cancelled"]);
  });
  it("sends undated tasks last in their group and falls back to the request date", () => {
    const sorted = sortTasksForDisplay([
      task("undated", TaskStatus.OPEN, "sin-fecha"),
      task("requested", TaskStatus.OPEN, "sin-fecha", null, "2026-10-01T10:00:00.000Z"),
      task("dated", TaskStatus.OPEN, "2026-09-20"),
    ]).map((item) => item.code);
    expect(sorted).toEqual(["requested", "dated", "undated"]);
  });
  it("does not modify the input", () => {
    const input = [task("a", TaskStatus.APPROVED, "2026-10-01"), task("b", TaskStatus.OPEN, "2026-09-01")];
    sortTasksForDisplay(input);
    expect(input.map((item) => item.code)).toEqual(["a", "b"]);
  });
  it("tells what is still to be done", () => {
    expect(isUnfinished(TaskStatus.IN_PROGRESS)).toBe(true);
    expect(isUnfinished(TaskStatus.OPEN)).toBe(true);
    expect(isUnfinished(TaskStatus.APPROVED)).toBe(false);
    expect(isUnfinished(TaskStatus.CANCELLED)).toBe(false);
  });
  it("only offers https links and formats the date", () => {
    expect(sytexLink("https://claro.sytex.io/task/1/")).toBe("https://claro.sytex.io/task/1/");
    expect(sytexLink("javascript:alert(1)")).toBeNull();
    expect(sytexLink(null)).toBeNull();
    expect(displayDate("2026-10-05")).toBe("05/10/2026");
    expect(displayDate("sin-fecha")).toBe("Sin fecha");
  });
});
