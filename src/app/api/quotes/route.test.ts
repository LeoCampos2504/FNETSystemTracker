import { describe, expect, it } from "vitest";
import { authedRequest, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { GET } from "./route";

describe("GET /api/quotes authorization and filters", () => {
  it("200s for admin with no filters", async () => {
    const request = await authedRequest("http://localhost/api/quotes", sessions.admin);
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect((await response.json()).length).toBeGreaterThan(0);
  });

  it("401s with no session", async () => {
    const response = await GET(unauthedRequest("http://localhost/api/quotes"));
    expect(response.status).toBe(401);
  });

  it("403s a technician (quotes aren't part of the technician role)", async () => {
    const request = await authedRequest("http://localhost/api/quotes", sessions.tech01);
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("defaults a coordinator with no filter to their own coordinatorId scope", async () => {
    const request = await authedRequest("http://localhost/api/quotes", sessions.coord1);
    const response = await GET(request);
    expect(response.status).toBe(200);
    const quotes = await response.json();
    for (const quote of quotes) expect(["zone-noa", "zone-nea"]).toContain(quote.zoneId);
  });

  it("allows a coordinator to filter by their own zone", async () => {
    const request = await authedRequest("http://localhost/api/quotes?zoneId=zone-noa", sessions.coord1);
    const response = await GET(request);
    expect(response.status).toBe(200);
  });

  it("forbids a coordinator from filtering by a zone they don't own", async () => {
    const request = await authedRequest("http://localhost/api/quotes?zoneId=zone-cuyo", sessions.coord1);
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it("forbids a coordinator from filtering by another coordinator's coordinatorId", async () => {
    const request = await authedRequest("http://localhost/api/quotes?coordinatorId=coord-2", sessions.coord1);
    const response = await GET(request);
    expect(response.status).toBe(403);
  });

  it(
    "regression: combining an owned zoneId with someone else's coordinatorId in the same request is still forbidden " +
      "(previously the nested if/else-if skipped validating coordinatorId whenever zoneId was present)",
    async () => {
      const request = await authedRequest("http://localhost/api/quotes?zoneId=zone-noa&coordinatorId=coord-2", sessions.coord1);
      const response = await GET(request);
      expect(response.status).toBe(403);
    },
  );

  it("400s an invalid status filter value", async () => {
    const request = await authedRequest("http://localhost/api/quotes?status=NOT_A_STATUS", sessions.admin);
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it("combines status + zoneId filters", async () => {
    const request = await authedRequest("http://localhost/api/quotes?zoneId=zone-cuyo&status=OPEN", sessions.coord2);
    const response = await GET(request);
    expect(response.status).toBe(200);
    const quotes = await response.json();
    for (const quote of quotes) {
      expect(quote.zoneId).toBe("zone-cuyo");
      expect(quote.status).toBe("OPEN");
    }
  });

  it("returns an empty array (not an error) when nothing matches", async () => {
    const request = await authedRequest("http://localhost/api/quotes?zoneId=zone-noa&projectId=does-not-exist", sessions.admin);
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
