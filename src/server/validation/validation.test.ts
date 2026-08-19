import { describe, expect, it } from "vitest";
import { loginBodySchema } from "./auth.schema";
import { assignTechniciansBodySchema, scheduleTaskBodySchema, updateTaskStatusBodySchema } from "./task.schema";
import { createGuardBodySchema } from "./guard.schema";

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
});
