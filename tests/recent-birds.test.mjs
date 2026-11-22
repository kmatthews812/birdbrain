import assert from 'node:assert/strict';
import test from 'node:test';
import { getRecentBirds } from '../lib/recent-birds.mjs';

const request = () => new Request('http://birdbrain.test/api/birds/recent?limit=999');
const crow = { id: 11, commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos', confidence: .75, timestamp: '2026-11-22T08:59:53-08:00', date: '2026-11-22', time: '08:59:53', clipName: 'crow.wav' };

test('loads thirty recent detections newest first, preserving repeated species and full bird payloads', async () => {
  let call;
  const newer = { ...crow, id: 12, timestamp: '2026-11-22T09:00:00-08:00', time: '09:00:00' };
  const response = await getRecentBirds(request(), {
    env: { BIRDNET_BASE_URL: 'http://birdnet.test:8080', BIRDNET_TOKEN: 'private-token' },
    fetch: async (url, options) => { call = { url: String(url), options }; return Response.json([crow, { ...newer, commonName: ' American Crow ' }]); },
  });
  assert.equal(call.url, 'http://birdnet.test:8080/api/v2/detections/recent?limit=30');
  assert.deepEqual(call.options.headers, { Accept: 'application/json', Authorization: 'Bearer private-token' });
  assert.equal(call.options.redirect, 'error');
  assert.equal(call.options.cache, 'no-store');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { birds: [newer, crow] });
});

test('returns an empty recent list and uses the Windows host by default', async () => {
  const response = await getRecentBirds(request(), { env: {}, fetch: async (url, options) => {
    assert.equal(String(url), 'http://127.0.0.1:8080/api/v2/detections/recent?limit=30');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    return Response.json([]);
  } });
  assert.deepEqual(await response.json(), { birds: [] });
});

test('caps the response at thirty detections even if BirdNET returns more', async () => {
  const rows = Array.from({ length: 35 }, (_, id) => ({ ...crow, id, timestamp: new Date(Date.UTC(2026, 10, 22, 0, id)).toISOString() }));
  const response = await getRecentBirds(request(), { env: {}, fetch: async () => Response.json(rows) });
  assert.deepEqual(await response.json(), { birds: rows.toReversed().slice(0, 30) });
});

test('hides unreachable, rejected and malformed recent detection responses', async () => {
  for (const fetch of [async () => { throw new Error('private details'); }, async () => new Response('private details', { status: 401 }), async () => Response.json({ birds: [] }), async () => Response.json([{ ...crow, confidence: 2 }])]) {
    const response = await getRecentBirds(request(), { env: {}, fetch });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'Recent birds could not be loaded.' });
  }
});

test('propagates caller cancellation to the upstream recent request', async () => {
  const controller = new AbortController();
  let upstreamSignal;
  await getRecentBirds(new Request('http://birdbrain.test/api/birds/recent', { signal: controller.signal }), { env: {}, fetch: async (_url, { signal }) => { upstreamSignal = signal; return Response.json([]); } });
  controller.abort();
  assert.equal(upstreamSignal.aborted, true);
});
