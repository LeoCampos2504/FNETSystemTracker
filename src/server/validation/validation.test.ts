import { describe, expect, it } from "vitest";
import { loginBodySchema } from "./auth.schema";
import {
  assignTechniciansBodySchema,
  scheduleTaskBodySchema,
  taskDayQuerySchema,
  updateTaskStatusBodySchema,
} from "./task.schema";
import { assignGuardBodySchema, createGuardBodySchema, updateGuardBodySchema } from "./guard.schema";

describe("loginBodySchema", () => {
  it("accepts a valid email/password", () => {
    expect(loginBodySchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(loginBodySchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
  });

  it("rejects a missing password", () => {
    expect(loginBodySchema.safeParse({ email: "a@b.com" }).success).toBe(false);
  });
});

describe("assignTechniciansBodySchema", () => {
  it("accepts exactly one PRIMARY plus one COLLABORATOR", () => {
    const result = assignTechniciansBodySchema.safeParse({
      assignments: [
        { technicianId: "tech-01", crewRole: "PRIMARY" },
        { technicianId: "tech-02", crewRole: "COLLABORATOR" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a single PRIMARY technician (exceptional solo crew)", () => {
    const result = assignTechniciansBodySchema.safeParse({
      assignments: [{ technicianId: "tech-01", crewRole: "PRIMARY" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects two PRIMARY technicians", () => {
    const result = assignTechniciansBodySchema.safeParse({
      assignments: [
        { technicianId: "tech-01", crewRole: "PRIMARY" },
        { technicianId: "tech-02", crewRole: "PRIMARY" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a solo COLLABORATOR with no PRIMARY", () => {
    const result = assignTechniciansBodySchema.safeParse({
      assignments: [{ technicianId: "tech-01", crewRole: "COLLABORATOR" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate technicianId", () => {
    const result = assignTechniciansBodySchema.safeParse({
      assignments: [
        { technicianId: "tech-01", crewRole: "PRIMARY" },
        { technicianId: "tech-01", crewRole: "COLLABORATOR" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than two technicians", () => {
    const result = assignTechniciansBodySchema.safeParse({
      assignments: [
        { technicianId: "tech-01", crewRole: "PRIMARY" },
        { technicianId: "tech-02", crewRole: "COLLABORATOR" },
        { technicianId: "tech-03", crewRole: "COLLABORATOR" },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("scheduleTaskBodySchema", () => {
  it("accepts a YYYY-MM-DD date", () => {
    expect(scheduleTaskBodySchema.safeParse({ scheduledDate: "2026-09-01" }).success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(scheduleTaskBodySchema.safeParse({ scheduledDate: "09/01/2026" }).success).toBe(false);
  });

  it("rejects a shape-valid but impossible calendar date", () => {
    expect(scheduleTaskBodySchema.safeParse({ scheduledDate: "2026-13-40" }).success).toBe(false);
    expect(scheduleTaskBodySchema.safeParse({ scheduledDate: "2026-02-30" }).success).toBe(false);
  });

  it("accepts a real leap-day date", () => {
    expect(scheduleTaskBodySchema.safeParse({ scheduledDate: "2024-02-29" }).success).toBe(true);
  });
});

describe("taskDayQuerySchema", () => {
  it("rejects an impossible calendar date in the 'date' query param", () => {
    expect(taskDayQuerySchema.safeParse({ date: "2026-04-31" }).success).toBe(false);
  });

  it("accepts an omitted date (defaults applied by the caller)", () => {
    expect(taskDayQuerySchema.safeParse({}).success).toBe(true);
  });
});

describe("updateTaskStatusBodySchema", () => {
  it("accepts a valid TaskStatus", () => {
    expect(updateTaskStatusBodySchema.safeParse({ status: "APPROVED" }).success).toBe(true);
  });

  it("rejects an invalid status value", () => {
    expect(updateTaskStatusBodySchema.safeParse({ status: "DONE" }).success).toBe(false);
  });
});

describe("createGuardBodySchema", () => {
  it("rejects endAt before startAt", () => {
    const result = createGuardBodySchema.safeParse({
      zoneId: "zone-noa",
      technicianIds: ["tech-01"],
      startAt: "2026-08-20T08:00:00.000Z",
      endAt: "2026-08-19T08:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than two technicians", () => {
    const result = createGuardBodySchema.safeParse({
      zoneId: "zone-noa",
      technicianIds: ["tech-01", "tech-02", "tech-03"],
      startAt: "2026-08-19T08:00:00.000Z",
      endAt: "2026-08-20T08:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero technicians", () => {
    const result = createGuardBodySchema.safeParse({
      zoneId: "zone-noa",
      technicianIds: [],
      startAt: "2026-08-19T08:00:00.000Z",
      endAt: "2026-08-20T08:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a duplicate technicianId", () => {
    const result = createGuardBodySchema.safeParse({
      zoneId: "zone-noa",
      technicianIds: ["tech-01", "tech-01"],
      startAt: "2026-08-19T08:00:00.000Z",
      endAt: "2026-08-20T08:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty zoneId", () => {
    const result = createGuardBodySchema.safeParse({
      zoneId: "",
      technicianIds: ["tech-01"],
      startAt: "2026-08-19T08:00:00.000Z",
      endAt: "2026-08-20T08:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateGuardBodySchema", () => {
  it("rejects a duplicate technicianId", () => {
    const result = updateGuardBodySchema.safeParse({ technicianIds: ["tech-01", "tech-01"] });
    expect(result.success).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(updateGuardBodySchema.safeParse({}).success).toBe(false);
  });

  it("accepts a partial update touching only one field", () => {
    expect(updateGuardBodySchema.safeParse({ endAt: "2026-08-25T08:00:00.000Z" }).success).toBe(true);
  });
});

describe("assignGuardBodySchema", () => {
  it("rejects a duplicate technicianId", () => {
    expect(assignGuardBodySchema.safeParse({ technicianIds: ["tech-01", "tech-01"] }).success).toBe(false);
  });

  it("rejects zero technicians", () => {
    expect(assignGuardBodySchema.safeParse({ technicianIds: [] }).success).toBe(false);
  });

  it("accepts a single technician exceptionally", () => {
    expect(assignGuardBodySchema.safeParse({ technicianIds: ["tech-01"] }).success).toBe(true);
  });
});
