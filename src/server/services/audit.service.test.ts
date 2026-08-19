import { describe, expect, it } from "vitest";
import { recordAudit } from "./audit.service";
import { repositories } from "@/server/container";

describe("recordAudit", () => {
  it("appends an entry with actor/action/entity/entityId/before/after/timestamp", async () => {
    const entry = await recordAudit(
      "user-coord-1",
      "TASK_STATUS_CHANGED",
      "Task",
      "task-P0001",
      { status: "OPEN" },
      { status: "IN_PROGRESS" },
    );

    expect(entry.actor).toBe("user-coord-1");
    expect(entry.action).toBe("TASK_STATUS_CHANGED");
    expect(entry.entity).toBe("Task");
    expect(entry.entityId).toBe("task-P0001");
    expect(entry.before).toEqual({ status: "OPEN" });
    expect(entry.after).toEqual({ status: "IN_PROGRESS" });
    expect(new Date(entry.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("is retrievable via listByEntity", async () => {
    await recordAudit("user-coord-1", "GUARD_UPDATED", "Guard", "guard-noa-1", null, { zoneId: "zone-noa" });
    const entries = await repositories.audit.listByEntity("Guard", "guard-noa-1");
    expect(entries.some((e) => e.action === "GUARD_UPDATED")).toBe(true);
  });
});
