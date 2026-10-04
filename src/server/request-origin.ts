/** Compare browser origins against deployment configuration, never proxy headers. */
export function hasAllowedRequestOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (origin === null) return true;

  try {
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
    let expectedOrigin = new URL(request.url).origin;
    if (railwayDomain) {
      const publicUrl = new URL(`https://${railwayDomain}`);
      if (publicUrl.host !== railwayDomain || publicUrl.username || publicUrl.password ||
          publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash) return false;
      expectedOrigin = publicUrl.origin;
    }
    return origin === expectedOrigin;
  } catch {
    return false;
  }
}
