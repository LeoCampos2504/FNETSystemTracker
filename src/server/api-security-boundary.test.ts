import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = join(process.cwd(), "src/app/api");
const publicRoutes = new Set([
  "auth/login/route.ts",
  "auth/logout/route.ts",
  "auth/me/route.ts",
  "health/route.ts",
]);

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

describe("API security boundaries", () => {
  it("requires database-backed Admin authorization in every operational API route", () => {
    const protectedRoutes = routeFiles(apiRoot).filter((path) => !publicRoutes.has(relative(apiRoot, path).replaceAll("\\", "/")));
    expect(protectedRoutes.length).toBeGreaterThan(0);
    for (const path of protectedRoutes) {
      const source = readFileSync(path, "utf8");
      expect(source, relative(apiRoot, path)).toContain("requireAdminSession()");
    }
  });

  it("keeps the authentication migration limited to FNET-owned tables", () => {
    const sql = readFileSync(join(process.cwd(), "prisma/migrations/20260924_add_app_users/migration.sql"), "utf8");
    const createdTables = [...sql.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"([^"]+)"/gi)].map((match) => match[1]);
    expect(createdTables.sort()).toEqual(["app_login_attempts", "app_sessions", "app_users"]);
    expect(sql).not.toMatch(/\b(?:ALTER|DROP)\s+TABLE\b/i);
  });
});
