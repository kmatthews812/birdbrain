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
