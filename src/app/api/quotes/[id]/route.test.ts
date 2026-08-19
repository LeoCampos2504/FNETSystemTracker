import { describe, expect, it } from "vitest";
import { authedRequest, sessions, unauthedRequest } from "@/server/testing/http-test-helpers";
import { GET } from "./route";

describe("GET /api/quotes/[id]", () => {
  it("200s for admin", async () => {
    // quote-004 is zone-cuyo (see src/mocks/quotes.ts).
    const request = await authedRequest("http://localhost/api/quotes/quote-004", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "quote-004" }) });
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe("quote-004");
  });

  it("200s for a coordinator in the quote's own zone", async () => {
    const request = await authedRequest("http://localhost/api/quotes/quote-004", sessions.coord2);
    const response = await GET(request, { params: Promise.resolve({ id: "quote-004" }) });
    expect(response.status).toBe(200);
  });

  it("401s with no session", async () => {
    const response = await GET(unauthedRequest("http://localhost/api/quotes/quote-004"), {
      params: Promise.resolve({ id: "quote-004" }),
    });
    expect(response.status).toBe(401);
  });

  it("403s a technician (quotes aren't part of the technician role)", async () => {
    const request = await authedRequest("http://localhost/api/quotes/quote-004", sessions.tech01);
    const response = await GET(request, { params: Promise.resolve({ id: "quote-004" }) });
    expect(response.status).toBe(403);
  });

  it("403s a coordinator outside the quote's zone", async () => {
    const request = await authedRequest("http://localhost/api/quotes/quote-004", sessions.coord1);
    const response = await GET(request, { params: Promise.resolve({ id: "quote-004" }) });
    expect(response.status).toBe(403);
  });

  it("404s an unknown quote id (additional endpoint, not part of Api)", async () => {
    const request = await authedRequest("http://localhost/api/quotes/does-not-exist", sessions.admin);
    const response = await GET(request, { params: Promise.resolve({ id: "does-not-exist" }) });
    expect(response.status).toBe(404);
  });
});
