import assert from 'node:assert/strict';
import test from 'node:test';
import { getBirdHistory, getBirdImage } from '../lib/bird-catalog.mjs';

const request = () => new Request('http://birdbrain.test/api/birds/history');

test('loads all-time species without date or count limits, normalizes, sorts, and deduplicates them', async () => {
  let call;
  const response = await getBirdHistory(request(), {
    env: { BIRDNET_BASE_URL: 'http://birdnet.test:8080', BIRDNET_TOKEN: 'server-token' },
    fetch: async (url, options) => {
      call = { url: String(url), options };
      return Response.json([
        { scientific_name: 'Corvus brachyrhynchos', common_name: 'American Crow', species_code: 'amecro', count: 398, last_heard: '2026-11-22T08:59:53-08:00' },
        { scientific_name: 'Calypte anna', common_name: "Anna's Hummingbird", species_code: 'annhum', count: 188, last_heard: '2026-11-22T08:57:23-08:00' },
        { scientific_name: ' Corvus brachyrhynchos ', common_name: 'Duplicate Crow', count: 398 },
        { scientific_name: 'Bubo virginianus', common_name: ' Great Horned Owl ', species_code: 'grhowl', count: 107, last_heard: '2026-11-18T00:00:00-08:00' },
      ]);
    },
  });
  assert.equal(call.url, 'http://birdnet.test:8080/api/v2/analytics/species/summary');
  assert.deepEqual(call.options.headers, { Accept: 'application/json', Authorization: 'Bearer server-token' });
  assert.equal(call.options.redirect, 'error');
  assert.equal(call.options.cache, 'no-store');
  assert.equal(call.options.signal.aborted, false);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { birds: [
    { commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos', speciesCode: 'amecro', count: 398, lastHeard: '2026-11-22T08:59:53-08:00' },
    { commonName: "Anna's Hummingbird", scientificName: 'Calypte anna', speciesCode: 'annhum', count: 188, lastHeard: '2026-11-22T08:57:23-08:00' },
    { commonName: 'Great Horned Owl', scientificName: 'Bubo virginianus', speciesCode: 'grhowl', count: 107, lastHeard: '2026-11-18T00:00:00-08:00' },
  ] });
});

test('accepts an empty history and defaults to the Windows host loopback', async () => {
  const response = await getBirdHistory(request(), { env: {}, fetch: async (url) => {
    assert.equal(String(url), 'http://127.0.0.1:8080/api/v2/analytics/species/summary');
    return Response.json([]);
  } });
  assert.deepEqual(await response.json(), { birds: [] });
});

test('reports unreachable, rejected, and malformed history without leaking upstream errors', async () => {
  for (const fetch of [async () => { throw new Error('secret details'); }, async () => new Response('secret details', { status: 403 }), async () => Response.json({ items: [] }), async () => Response.json([{ common_name: 'Crow' }])]) {
    const response = await getBirdHistory(request(), { env: {}, fetch });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Bird history could not be loaded.' });
  }
});

test('passes request cancellation through to the BirdNET history request', async () => {
  const controller = new AbortController();
  let signal;
  const response = await getBirdHistory(new Request('http://birdbrain.test/api/birds/history', { signal: controller.signal }), {
    env: {}, fetch: async (_url, options) => { signal = options.signal; return Response.json([]); },
  });
  controller.abort();
  assert.equal(signal.aborted, true);
  assert.equal(response.status, 200);
});

test('proxies raster images from the configured BirdNET server without forwarding credentials to redirects', async () => {
  const bytes = new Uint8Array([255, 216, 255, 224]);
  const response = await getBirdImage(new Request('http://birdbrain.test/api/birds/image?species=Corvus%20brachyrhynchos'), {
    env: { BIRDNET_BASE_URL: 'http://birdnet.test:8080', BIRDNET_TOKEN: 'private-token' },
    fetch: async (url, options) => {
      assert.equal(String(url), 'http://birdnet.test:8080/api/v2/media/image/Corvus%20brachyrhynchos');
      assert.equal(options.headers.Authorization, 'Bearer private-token');
      assert.equal(options.redirect, 'error');
      return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Set-Cookie': 'upstream-private', 'X-Internal': 'private' } });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=86400');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(response.headers.get('X-Internal'), null);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('rejects unsafe, missing, and overlong species names before fetching images', async () => {
  for (const species of ['', '../settings', 'https://other.test/secret', 'Crow\\..', 'Corvus\ncorax', 'a'.repeat(161)]) {
    const response = await getBirdImage(new Request('http://birdbrain.test/api/birds/image?species=' + encodeURIComponent(species)), { fetch: async () => assert.fail('must not request invalid species') });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Provide a valid scientific name.' });
  }
});

test('rejects active image formats and failed upstream image requests', async () => {
  for (const upstream of [() => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }), () => new Response('secret', { status: 500 }), () => { throw new Error('secret'); }]) {
    const response = await getBirdImage(new Request('http://birdbrain.test/api/birds/image?species=Corvus%20corax'), { env: {}, fetch: upstream });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Bird image could not be loaded.' });
  }
});

test('preserves missing-image status so the UI can show an honest fallback', async () => {
  const response = await getBirdImage(new Request('http://birdbrain.test/api/birds/image?species=Corvus%20corax'), { env: {}, fetch: async () => new Response(null, { status: 404 }) });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'No image is available for this bird.' });
});

test('returns image attribution from BirdNET with safe source and license links', async () => {
  const credit = { authorName: 'Adam Jackson', authorURL: 'https://example.test/author', licenseName: 'CC0 1.0 Universal', licenseURL: 'https://creativecommons.org/publicdomain/zero/1.0/', sourceProvider: 'avicommons' };
  const response = await getBirdImage(new Request('http://birdbrain.test/api/birds/image?species=Corvus%20brachyrhynchos&info=1'), {
    env: { BIRDNET_BASE_URL: 'http://birdnet.test:8080', BIRDNET_TOKEN: 'private-token' },
    fetch: async (url, options) => {
      assert.equal(String(url), 'http://birdnet.test:8080/api/v2/media/species-image/info?name=Corvus+brachyrhynchos');
      assert.deepEqual(options.headers, { Accept: 'application/json', Authorization: 'Bearer private-token' });
      assert.equal(options.redirect, 'error');
      return Response.json({ ...credit, internal: 'never forward' });
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), credit);
});

test('strips unsafe attribution links and normalizes missing attribution fields', async () => {
  const response = await getBirdImage(new Request('http://birdbrain.test/api/birds/image?species=Corvus%20corax&info=1'), { env: {}, fetch: async () => Response.json({ authorName: 'Photographer', authorURL: 'javascript:alert(1)', licenseURL: 'data:text/html,secret' }) });
  assert.deepEqual(await response.json(), { authorName: 'Photographer', authorURL: '', licenseName: '', licenseURL: '', sourceProvider: '' });
});

test('rejects malformed attribution responses', async () => {
  for (const payload of [null, [], { authorName: {} }]) {
    const response = await getBirdImage(new Request('http://birdbrain.test/api/birds/image?species=Corvus%20corax&info=1'), { env: {}, fetch: async () => Response.json(payload) });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Bird image could not be loaded.' });
  }
});
