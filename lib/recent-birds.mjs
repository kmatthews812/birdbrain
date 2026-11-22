import { readDetection } from './detections.mjs';

export async function getRecentBirds(request, { env = process.env, fetch: fetcher = globalThis.fetch } = {}) {
  try {
    const url = new URL('/api/v2/detections/recent?limit=30', env.BIRDNET_BASE_URL || 'http://127.0.0.1:8080');
    const response = await fetcher(url, {
      headers: { Accept: 'application/json', ...(env.BIRDNET_TOKEN ? { Authorization: `Bearer ${env.BIRDNET_TOKEN}` } : {}) },
      cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Upstream failure'); }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Invalid recent detections');
    const birds = rows.map(row => readDetection(JSON.stringify(row)));
    if (birds.some(bird => !bird)) throw new Error('Invalid detection');
    birds.sort((left, right) => (Date.parse(right.timestamp) || 0) - (Date.parse(left.timestamp) || 0));
    return Response.json({ birds: birds.slice(0, 30) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Recent birds could not be loaded.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
