import { describe, expect, it } from "vitest";
import { findTechnicianById } from "./technician.service";

describe("findTechnicianById", () => {
  it("resolves the technician when it exists", async () => {
    const technician = await findTechnicianById("tech-01");
    expect(technician?.id).toBe("tech-01");
  });

  it("resolves null instead of throwing for an unknown id (backs Api.getTechnician)", async () => {
    expect(await findTechnicianById("does-not-exist")).toBeNull();
  });
});
