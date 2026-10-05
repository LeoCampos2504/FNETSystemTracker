import { describe, expect, it } from "vitest";
import { TaskStatus, TaskType } from "@/contracts";
import { formTask, taskStatus } from "./synced-data";

describe("task status normalization", () => {
  it.each([
    ["OPEN", TaskStatus.OPEN],
    ["IN_PROGRESS", TaskStatus.IN_PROGRESS],
    ["EN PROCESO", TaskStatus.IN_PROGRESS],
    ["IN_REVIEW", TaskStatus.IN_REVIEW],
    ["SENT", TaskStatus.SENT],
    ["REJECTED", TaskStatus.REJECTED],
    ["CANCELLED", TaskStatus.CANCELLED],
    ["APPROVED", TaskStatus.APPROVED],
    ["APPROVED_WITH_PENDING", TaskStatus.APPROVED_WITH_PENDING],
    ["APROBADO CON PENDIENTES", TaskStatus.APPROVED_WITH_PENDING],
  ])("maps %s to the canonical task state", (raw, expected) => {
    expect(taskStatus(raw)).toBe(expected);
  });
});

describe("tasks built from the direct Sytex synchronization", () => {
  const base = { code: "FO-26-610440", type: "PREVENTIVO", project: "BAM - MPC Mantenimiento Preventivo Civil O&M", siteCode: "BA00700", description: "MPC-GE", technicians: ["Ana", "Luis", "Extra"], status: "In progress", planDate: new Date("2026-10-20T00:00:00Z"), link: "https://claro.sytex.io/x", syncedAt: new Date("2026-10-05T19:00:00Z") };
  it("keeps the zone, status, plan date, crew and link of the form", () => {
    expect(formTask(base)).toMatchObject({ taskCode: "FO-26-610440", zoneId: base.project, status: TaskStatus.IN_PROGRESS, scheduledDate: "2026-10-20", siteCode: "BA00700", assignedTo: "Ana", collaborator: "Luis", externalUrl: base.link });
    expect(formTask(base)?.assignments).toHaveLength(2);
  });
  it("shows a form without status or date as open and undated, and skips other kinds of form", () => {
    expect(formTask({ ...base, status: "", planDate: null, technicians: [], siteCode: "" })).toMatchObject({ status: TaskStatus.OPEN, scheduledDate: "sin-fecha", siteCode: "Sin sitio informado", assignments: [] });
    expect(formTask({ ...base, type: "OTRO" })).toBeNull();
    expect(formTask({ ...base, type: "CORRECTIVO", code: "FO-26-610441" })).toBeNull();
    expect(formTask({ ...base, type: "CORRECTIVO", code: "TA-26-412547" })).toMatchObject({ taskCode: "TA-26-412547", type: TaskType.CORRECTIVE });
  });
});
