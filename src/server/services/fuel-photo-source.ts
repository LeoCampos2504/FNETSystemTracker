import { sytexSettings } from './sytex-sync';

/** Read-only capability check: no credentials, notes, people or file URLs leave the server. */
export async function inspectFuelPhotoSource(formCode: string, index: string, fetcher: typeof fetch = fetch) {
  const settings = sytexSettings();
  if (!settings) return { available: false, code: 'SYTEX_NOT_CONFIGURED' };
  if (settings.baseUrl !== 'https://claro.sytex.io' || settings.organization !== '1') return { available: false, code: 'SYTEX_TARGET_NOT_VERIFIED' };
  const path = '/api/urformanswer/?' + new URLSearchParams({ code: formCode, index, limit: '1' });
  const attempts: number[] = [];
  for (const authorization of settings.candidates) {
    let response: Response;
    try { response = await fetcher(settings.baseUrl + path, { headers: { Authorization: authorization, Organization: settings.organization, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000), cache: 'no-store' }); }
    catch { return { available: false, code: 'SYTEX_PHOTO_SOURCE_UNREACHABLE' }; }
    attempts.push(response.status);
    if ([401, 403].includes(response.status)) continue;
    if (!response.ok) return { available: false, code: 'SYTEX_PHOTO_SOURCE_ERROR', statuses: attempts };
    const body: unknown = await response.json().catch(() => null);
    // Describe structure only. Original values remain inside Sytex until its file contract is verified.
    const shape = (v: unknown, depth = 0): unknown => {
      if (depth > 6) return typeof v;
      if (Array.isArray(v)) return { count: v.length, first: v.length ? shape(v[0], depth + 1) : null };
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, shape(val, depth + 1)]));
      return v === null ? 'null' : typeof v;
    };
    return { available: true, shape: shape(body) };
  }
  return { available: false, code: 'SYTEX_PHOTO_ACCESS_DENIED', statuses: attempts };
}
