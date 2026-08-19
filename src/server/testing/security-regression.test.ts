import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "@/server/auth/env";
import { GET as getTask } from "@/app/api/tasks/[id]/route";
import { GET as getTasksToday } from "@/app/api/tasks/today/route";
import { PUT as putSchedule } from "@/app/api/tasks/[id]/schedule/route";
import { authedRequest, jsonInit, sessions } from "./http-test-helpers";

describe("cookie tampering", () => {
  it("a manipulated (bit-flipped) cookie is rejected the same as no cookie", async () => {
    const request = new NextRequest("http://localhost/api/tasks/today", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=eyJhbGciOiJIUzI1NiJ9.tampered.payload` },
    });
    const response = await getTasksToday(request);
    expect(response.status).toBe(401);
  });

  it("an empty cookie value is rejected", async () => {
    const request = new NextRequest("http://localhost/api/tasks/today", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=` },
    });
    const response = await getTasksToday(request);
    expect(response.status).toBe(401);
  });
});

describe("body tolerates unexpected extra fields (forward compatibility)", () => {
  it("an unrecognized extra field in the request body doesn't break a valid mutation", async () => {
    // task-P0202 (zone-nea, tech-04/tech-05) is untouched by other test files.
    const request = await authedRequest(
      "http://localhost/api/tasks/task-P0202/schedule",
      sessions.coord1,
      jsonInit("PUT", { scheduledDate: "2026-09-25", someFutureSytexField: "unexpected-but-harmless" }),
    );
    const response = await putSchedule(request, { params: Promise.resolve({ id: "task-P0202" }) });
    expect(response.status).toBe(200);
  });
});

describe("arbitrary/malicious-looking path ids don't crash the server", () => {
  const suspiciousIds = ["../../etc/passwd", "'; DROP TABLE tasks; --", "<script>alert(1)</script>", "%00", " "];

  it.each(suspiciousIds)("GET /api/tasks/%s resolves null (200), never a 500", async (id) => {
    const request = await authedRequest(`http://localhost/api/tasks/${encodeURIComponent(id)}`, sessions.admin);
    const response = await getTask(request, { params: Promise.resolve({ id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});

describe("invalid query param values are rejected with 400, never 500", () => {
  it("a wildly malformed date query param 400s", async () => {
    const request = await authedRequest(
      "http://localhost/api/tasks/today?date=' OR '1'='1",
      sessions.admin,
    );
    const response = await getTasksToday(request);
    expect(response.status).toBe(400);
  });

  it("an empty-string zoneId query param 400s (fails min-length validation) instead of being silently ignored", async () => {
    const request = await authedRequest("http://localhost/api/tasks/today?zoneId=", sessions.admin);
    const response = await getTasksToday(request);
    expect(response.status).toBe(400);
  });
});

describe("content-type is application/json across success and error responses", () => {
  it("on a successful GET", async () => {
    const request = await authedRequest("http://localhost/api/tasks/today", sessions.admin);
    const response = await getTasksToday(request);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("on a 401 error", async () => {
    const response = await getTasksToday(new NextRequest("http://localhost/api/tasks/today"));
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("on a 400 validation error", async () => {
    const request = await authedRequest("http://localhost/api/tasks/today?date=nonsense", sessions.admin);
    const response = await getTasksToday(request);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
