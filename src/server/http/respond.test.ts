import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { ApiError, badRequest } from "./errors";
import { jsonError, withErrorHandling } from "./respond";

describe("jsonError", () => {
  it("produces { error: { code, message } } with the error's status", async () => {
    const response = jsonError(badRequest("nope"));
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body).toEqual({ error: { code: "VALIDATION_ERROR", message: "nope" } });
  });

  it("includes details only when the ApiError carries them", async () => {
    const response = jsonError(badRequest("nope", { field: "x" }));
    const body = await response.json();
    expect(body.error.details).toEqual({ field: "x" });
  });
});

describe("withErrorHandling", () => {
  it("passes through a successful response unchanged", async () => {
    const response = await withErrorHandling(async () => NextResponse.json({ ok: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("maps a thrown ApiError to its own status/code", async () => {
    const response = await withErrorHandling(async () => {
      throw badRequest("field required");
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("maps an unexpected (non-ApiError) throw to a generic 500 — never leaking the internal message", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await withErrorHandling(async () => {
        throw new Error("connection string: postgres://user:hunter2@host/db");
      });
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe("Unexpected server error");
      expect(JSON.stringify(body)).not.toContain("hunter2");
      expect(JSON.stringify(body)).not.toContain("postgres://");
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("never includes a stack trace in the response body for an unexpected error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await withErrorHandling(async () => {
        throw new TypeError("Cannot read properties of undefined (reading 'foo')");
      });
      const text = await response.text();
      expect(text).not.toContain("at ");
      expect(text).not.toContain(".ts:");
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("re-throwing the same ApiError twice from different calls still maps identically (no shared mutable state)", async () => {
    const err = new ApiError(409, "CONFLICT", "already done");
    const first = await withErrorHandling(async () => {
      throw err;
    });
    const second = await withErrorHandling(async () => {
      throw err;
    });
    expect(first.status).toBe(second.status);
    expect(await first.json()).toEqual(await second.json());
  });
});
