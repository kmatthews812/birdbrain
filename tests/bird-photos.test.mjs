import assert from 'node:assert/strict';
import test from 'node:test';
import { createBirdPhotoHandler } from '../lib/bird-photos.mjs';
const species = 'Corvus brachyrhynchos';
const request = (name = species, signal) => new Request(`http://birdbrain.test/api/birds/photo?species=${encodeURIComponent(name)}`, { signal });
const photo = (id, extra = {}) => ({ photo: { id, license_code: 'cc-by', attribution_name: `Photographer ${id}`, large_url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/large.jpg`, ...extra } });
function upstream(photos, calls) {
  return async url => {
    calls.push(String(url));
    return Response.json(String(url).includes('/taxa?') ? { results: [{ id: 8021, name: species }] } : { results: [{ name: species, taxon_photos: photos }] });
  };
}
test('rotates exact-species licensed photos and caches the candidate list for one hour', async () => {
  const calls = [];
  let now = 0;
  const handle = createBirdPhotoHandler({ fetch: upstream([photo(1), photo(2)], calls), random: () => 0, now: () => now });
  const first = await handle(request());
  assert.equal(first.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await first.json(), { url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/large.jpg', authorName: 'Photographer 1', authorURL: 'https://www.inaturalist.org/photos/1', licenseName: 'CC BY 4.0', licenseURL: 'https://creativecommons.org/licenses/by/4.0/', sourceProvider: 'iNaturalist' });
  assert.equal((await (await handle(request())).json()).url, 'https://inaturalist-open-data.s3.amazonaws.com/photos/2/large.jpg');
  assert.equal(calls.length, 2);
  now = 3600001;
  await handle(request());
  assert.equal(calls.length, 4);
});
test('filters unlicensed and unsafe photos while permitting a single safe photo', async () => {
  const handle = createBirdPhotoHandler({ fetch: upstream([photo(1, { license_code: null }), photo(2, { large_url: 'https://evil.test/image.jpg' }), photo(3, { license_code: 'cc0' })], []), random: () => 0 });
  const result = await (await handle(request())).json();
  assert.equal(result.url, 'https://inaturalist-open-data.s3.amazonaws.com/photos/3/large.jpg');
  assert.equal(result.licenseURL, 'https://creativecommons.org/publicdomain/zero/1.0/');
  assert.equal((await (await handle(request())).json()).url, result.url);
});
test('falls back to BirdNET with its attribution when exact species has no candidates', async () => {
  const calls = [];
  const handle = createBirdPhotoHandler({ env: { BIRDNET_BASE_URL: 'http://birdnet.test' }, fetch: async url => {
    calls.push(String(url));
    if (String(url).startsWith('https://api.inaturalist.org')) return Response.json({ results: [{ id: 99, name: 'Corvus corax' }] });
    return Response.json({ authorName: 'Ada', authorURL: 'https://example.org/ada', licenseName: 'CC0', licenseURL: 'https://example.org/license', sourceProvider: 'BirdNET' });
  } });
  assert.deepEqual(await (await handle(request())).json(), { url: '/api/birds/image?species=Corvus%20brachyrhynchos', authorName: 'Ada', authorURL: 'https://example.org/ada', licenseName: 'CC0', licenseURL: 'https://example.org/license', sourceProvider: 'BirdNET' });
  assert.equal(calls.length, 2);
  assert.equal(calls[1], 'http://birdnet.test/api/v2/media/species-image/info?name=Corvus+brachyrhynchos');
});
test('rejects invalid species without network calls', async () => {
  const handle = createBirdPhotoHandler({ fetch: () => assert.fail('unexpected request') });
  assert.equal((await handle(request('../secrets'))).status, 400);
  assert.equal((await handle(request(''))).status, 400);
});
test('aborts an abandoned lookup without caching or starting fallback work', async () => {
  const controller = new AbortController();
  let calls = 0;
  const handle = createBirdPhotoHandler({ fetch: (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } });
  const pending = handle(request(species, controller.signal));
  controller.abort();
  assert.equal((await pending).status, 499);
  assert.equal(calls, 1);
});
