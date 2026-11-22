import assert from 'node:assert/strict';
import test from 'node:test';
import { getBirdHistory } from '../lib/bird-catalog.mjs';

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
