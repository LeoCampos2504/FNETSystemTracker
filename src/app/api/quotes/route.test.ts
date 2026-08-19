import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@/contracts";
import { signSession } from "@/server/auth/jwt";
import { SESSION_COOKIE_NAME } from "@/server/auth/env";
import { GET } from "./route";

async function requestAs(url: string, claims: Parameters<typeof signSession>[0]): Promise<Response> {
  const { token } = await signSession(claims);
  const request = new NextRequest(url, { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } });
  return GET(request);
}

// coord-1 owns zone-noa/zone-nea; coord-2 owns zone-cuyo/zone-centro (see src/mocks/coordinators.ts).
const coord1: Parameters<typeof signSession>[0] = {
  sub: "user-coord-1",
  role: UserRole.COORDINATOR,
  technicianId: null,
  coordinatorId: "coord-1",
};

describe("GET /api/quotes authorization", () => {
  it("allows a coordinator to filter by their own zone", async () => {
    const response = await requestAs("http://localhost/api/quotes?zoneId=zone-noa", coord1);
    expect(response.status).toBe(200);
  });

  it("forbids a coordinator from filtering by a zone they don't own", async () => {
    const response = await requestAs("http://localhost/api/quotes?zoneId=zone-cuyo", coord1);
    expect(response.status).toBe(403);
  });

  it("forbids a coordinator from filtering by another coordinator's coordinatorId", async () => {
    const response = await requestAs("http://localhost/api/quotes?coordinatorId=coord-2", coord1);
    expect(response.status).toBe(403);
  });

  it(
    "regression: combining an owned zoneId with someone else's coordinatorId in the same request is still forbidden " +
      "(previously the nested if/else-if skipped validating coordinatorId whenever zoneId was present)",
    async () => {
      const response = await requestAs(
        "http://localhost/api/quotes?zoneId=zone-noa&coordinatorId=coord-2",
        coord1,
      );
      expect(response.status).toBe(403);
    },
  );
});
