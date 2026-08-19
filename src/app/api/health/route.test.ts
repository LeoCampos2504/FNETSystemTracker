import { describe, expect, it } from "vitest";
import { getHealthStatus } from "./route";

describe("GET /api/health", () => {
  it("returns the expected status payload", () => {
    expect(getHealthStatus()).toEqual({ status: "ok", service: "fnet-system-tracker" });
  });
});
