import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ settings: vi.fn() }));
vi.mock('./sytex-sync', () => ({ sytexSettings: mocks.settings }));
import { inspectFuelPhotoSource } from './fuel-photo-source';
beforeEach(() => mocks.settings.mockReturnValue({ baseUrl: 'https://claro.sytex.io', organization: '1', candidates: ['Token synthetic'] }));
describe('photo metadata read capability', () => {
  it('uses only authenticated GET with a bounded exact form/index and never returns source values', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({results:[{id:1,answer_media:[{when_created:'2026-08-06T15:46Z',url:'https://private.invalid/file'}]}]}));
    const result = await inspectFuelPhotoSource('FO-26-000001','9.2A.2',fetcher);
    expect(result.available).toBe(true); expect(JSON.stringify(result)).not.toContain('private.invalid'); expect(JSON.stringify(result)).not.toContain('2026-08-06');
    expect(fetcher.mock.calls[0][0]).toContain('code=FO-26-000001&index=9.2A.2&limit=1');
    expect(fetcher.mock.calls[0][1]).toMatchObject({redirect:'error',cache:'no-store',headers:{Organization:'1'}});
  });
  it('reports denied access honestly without reusing response edits as photo dates', async () => {
    expect(await inspectFuelPhotoSource('FO-26-000001','9.2A.2',vi.fn().mockResolvedValue(new Response('',{status:403})))).toEqual({available:false,code:'SYTEX_PHOTO_ACCESS_DENIED',statuses:[403]});
  });
  it('does not follow redirects or reveal error bodies or credentials', async () => {
    const result=await inspectFuelPhotoSource('FO-26-000001','9.2A.2',vi.fn().mockRejectedValue(new Error('Token synthetic')));
    expect(result).toEqual({available:false,code:'SYTEX_PHOTO_SOURCE_UNREACHABLE'});
  });
  it('refuses an unexpected destination without sending any credential', async () => {
    mocks.settings.mockReturnValue({baseUrl:'https://other.invalid',organization:'1',candidates:['Token synthetic']});
    const fetcher=vi.fn();expect((await inspectFuelPhotoSource('FO-26-000001','9.2A.2',fetcher)).available).toBe(false);expect(fetcher).not.toHaveBeenCalled();
  });
});
