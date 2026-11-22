function failure(message, status = 502) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function upstreamOptions(request, env, accept) {
  return {
    headers: { Accept: accept, ...(env.BIRDNET_TOKEN ? { Authorization: `Bearer ${env.BIRDNET_TOKEN}` } : {}) },
    cache: 'no-store', redirect: 'error',
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
  };
}

export async function getBirdHistory(request, { env = process.env, fetch: fetcher = globalThis.fetch } = {}) {
  try {
    const response = await fetcher(new URL('/api/v2/analytics/species/summary', env.BIRDNET_BASE_URL || 'http://127.0.0.1:8080'), upstreamOptions(request, env, 'application/json'));
    if (!response.ok) { await response.body?.cancel(); throw new Error('Upstream failure'); }
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Invalid species summary');
    const species = new Map();
    for (const row of rows) {
      const commonName = row?.common_name?.trim();
      const scientificName = row?.scientific_name?.trim();
      if (!commonName || !scientificName) throw new Error('Invalid species summary');
      const key = scientificName.toLowerCase();
      if (!species.has(key)) species.set(key, {
        commonName, scientificName, speciesCode: row.species_code,
        count: row.count, lastHeard: row.last_heard,
      });
    }
    const birds = [...species.values()].sort((left, right) => left.commonName.localeCompare(right.commonName, 'en'));
    return Response.json({ birds }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return failure('Bird history could not be loaded.'); }
}

export async function getBirdImage(request, { env = process.env, fetch: fetcher = globalThis.fetch } = {}) {
  const species = new URL(request.url).searchParams.get('species')?.trim() || '';
  if (!/^\p{L}[\p{L}\p{M} .'-]{0,159}$/u.test(species)) return failure('Provide a valid scientific name.', 400);
  try {
    const url = new URL(`/api/v2/media/image/${encodeURIComponent(species)}`, env.BIRDNET_BASE_URL || 'http://127.0.0.1:8080');
    const response = await fetcher(url, upstreamOptions(request, env, 'image/*'));
    if (response.status === 404) {
      await response.body?.cancel();
      return failure('No image is available for this bird.', 404);
    }
    const contentType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
    if (!response.ok || !response.body || !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(contentType)) {
      await response.body?.cancel();
      throw new Error('Invalid image response');
    }
    return new Response(response.body, { headers: {
      'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch { return failure('Bird image could not be loaded.'); }
}
