import { describe, expect, it } from "vitest";
import { ApiError, badRequest, conflict, forbidden, notAuthenticated, notFound } from "./errors";

describe("error factories", () => {
  it("badRequest is a 400 VALIDATION_ERROR", () => {
    const err = badRequest("bad input", { field: "x" });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("bad input");
    expect(err.details).toEqual({ field: "x" });
  });

  it("notAuthenticated is a 401 NOT_AUTHENTICATED with a sensible default message", () => {
    const err = notAuthenticated();
    expect(err.status).toBe(401);
    expect(err.code).toBe("NOT_AUTHENTICATED");
    expect(err.message.length).toBeGreaterThan(0);
  });

  it("forbidden is a 403 FORBIDDEN", () => {
    const err = forbidden("no access");
    expect(err.status).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("notFound is a 404 NOT_FOUND", () => {
    const err = notFound();
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("conflict is a 409 CONFLICT", () => {
    const err = conflict("already approved");
    expect(err.status).toBe(409);
    expect(err.code).toBe("CONFLICT");
  });

  it("details is omitted (undefined) when not passed, not present as null/empty", () => {
    const err = notFound("gone");
    expect(err.details).toBeUndefined();
  });
});
