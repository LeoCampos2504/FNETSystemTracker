import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as getTechnicianKpisRoute } from "@/app/api/kpis/technicians/[id]/route";
import { GET as getRankingRoute } from "@/app/api/kpis/ranking/route";

/**
 * Exercises the actual Next.js route handlers (real request/response
 * objects) against the real seeded DB — not the underlying fetch.ts
 * functions directly, so this also proves query-param validation and
 * response shaping work end to end.
 */
describe("GET /api/kpis/technicians/:id (real DB)", () => {
  it("returns 200 with KPIs for an existing technician", async () => {
    const request = new NextRequest("http://localhost/api/kpis/technicians/tech-01?from=2026-07-01&to=2026-08-31");
    const response = await getTechnicianKpisRoute(request, { params: Promise.resolve({ id: "tech-01" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ technicianId: "tech-01" });
  });

  it("returns 200 with a null body for a nonexistent technician (contract's X | null convention)", async () => {
    const request = new NextRequest("http://localhost/api/kpis/technicians/tech-does-not-exist");
    const response = await getTechnicianKpisRoute(request, { params: Promise.resolve({ id: "tech-does-not-exist" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("defaults to the current calendar month when from/to are omitted", async () => {
    const request = new NextRequest("http://localhost/api/kpis/technicians/tech-01");
    const response = await getTechnicianKpisRoute(request, { params: Promise.resolve({ id: "tech-01" }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.periodStart.slice(0, 7)).toBe(body.periodEnd.slice(0, 7));
  });

  it("rejects a malformed date range with 400, not a 500 or a silently-wrong result", async () => {
    const request = new NextRequest("http://localhost/api/kpis/technicians/tech-01?from=not-a-date&to=2026-08-31");
    const response = await getTechnicianKpisRoute(request, { params: Promise.resolve({ id: "tech-01" }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});

describe("GET /api/kpis/ranking (real DB)", () => {
  it("returns 200 with a ranked list when called with no filters", async () => {
    const request = new NextRequest("http://localhost/api/kpis/ranking?from=2026-07-01&to=2026-08-31");
    const response = await getRankingRoute(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it("filters by an existing zoneId", async () => {
    const request = new NextRequest("http://localhost/api/kpis/ranking?zoneId=zone-noa&from=2026-07-01&to=2026-08-31");
    const response = await getRankingRoute(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.length).toBeGreaterThan(0);
  });

  it("returns a valid empty array for a zoneId that matches no technicians", async () => {
    const request = new NextRequest("http://localhost/api/kpis/ranking?zoneId=zone-does-not-exist");
    const response = await getRankingRoute(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
