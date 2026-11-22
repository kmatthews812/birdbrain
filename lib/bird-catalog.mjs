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
  const params = new URL(request.url).searchParams;
  const species = params.get('species')?.trim() || '';
  const info = params.get('info') === '1';
  if (!/^\p{L}[\p{L}\p{M} .'-]{0,159}$/u.test(species)) return failure('Provide a valid scientific name.', 400);
  try {
    const path = info ? '/api/v2/media/species-image/info' : `/api/v2/media/image/${encodeURIComponent(species)}`;
    const url = new URL(path, env.BIRDNET_BASE_URL || 'http://127.0.0.1:8080');
    if (info) url.searchParams.set('name', species);
    const response = await fetcher(url, upstreamOptions(request, env, info ? 'application/json' : 'image/*'));
    if (response.status === 404) {
      await response.body?.cancel();
      return failure('No image is available for this bird.', 404);
    }
    if (info && response.ok) {
      const data = await response.json();
      if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Invalid attribution');
      const credit = {};
      for (const key of ['authorName', 'authorURL', 'licenseName', 'licenseURL', 'sourceProvider']) {
        if (data[key] != null && typeof data[key] !== 'string') throw new Error('Invalid attribution');
        credit[key] = data[key] || '';
      }
      for (const key of ['authorURL', 'licenseURL']) {
        try {
          if (!['http:', 'https:'].includes(new URL(credit[key]).protocol)) credit[key] = '';
        } catch { credit[key] = ''; }
      }
      return Response.json(credit, { headers: { 'Cache-Control': 'public, max-age=86400' } });
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
