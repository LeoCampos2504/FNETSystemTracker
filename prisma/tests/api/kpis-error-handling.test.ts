import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The one case that doesn't need the real DB: forces the data layer to
 * throw (simulating a DB outage/error) and asserts the route handler
 * returns a clean 500 without leaking the error's message or stack into the
 * response body. Mocked at the module the route imports
 * (@/server/kpis/fetch), so this is still exercising the real route handler
 * code, just with a failing dependency.
 */
vi.mock("@/server/kpis/fetch", () => ({
  getTechnicianKpis: vi.fn().mockRejectedValue(new Error("connection to postgres://secret-internal-host failed")),
  getTechnicianRanking: vi.fn().mockRejectedValue(new Error("connection to postgres://secret-internal-host failed")),
}));

describe("KPI routes handle a failing data layer without leaking internals", () => {
  it("GET /api/kpis/technicians/:id returns 500 with a generic message", async () => {
    const { GET } = await import("@/app/api/kpis/technicians/[id]/route");
    const request = new NextRequest("http://localhost/api/kpis/technicians/tech-01");
    const response = await GET(request, { params: Promise.resolve({ id: "tech-01" }) });

    expect(response.status).toBe(500);
    const body = await response.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("secret-internal-host");
    expect(serialized).not.toContain("postgres://");
    expect(body).not.toHaveProperty("stack");
  });

  it("GET /api/kpis/ranking returns 500 with a generic message", async () => {
    const { GET } = await import("@/app/api/kpis/ranking/route");
    const request = new NextRequest("http://localhost/api/kpis/ranking");
    const response = await GET(request);

    expect(response.status).toBe(500);
    const body = await response.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("secret-internal-host");
    expect(body).not.toHaveProperty("stack");
  });
});
