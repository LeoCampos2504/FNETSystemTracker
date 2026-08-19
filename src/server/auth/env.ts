// Dev-only fallback so `npm run dev` / `npm test` work with zero setup. Never
// used in production: a missing AUTH_SECRET there is a hard failure.
const INSECURE_DEV_FALLBACK_SECRET = "insecure-dev-secret-do-not-use-in-production";

export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return new TextEncoder().encode(INSECURE_DEV_FALLBACK_SECRET);
  }
  return new TextEncoder().encode(secret);
}

export const SESSION_COOKIE_NAME = "fnet_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours
