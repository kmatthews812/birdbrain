import { getBirdImage } from './bird-catalog.mjs';

const licenses = {
  cc0: ['CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
  'cc-by': ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
  'cc-by-sa': ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
};
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function createBirdPhotoHandler({ fetch: fetcher = globalThis.fetch, env = process.env, random = Math.random, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async request => {
    const species = new URL(request.url).searchParams.get('species')?.trim() || '';
    if (!/^\p{L}[\p{L}\p{M} .'-]{0,159}$/u.test(species)) return json({ error: 'Provide a valid scientific name.' }, 400);
    if (request.signal.aborted) return json({ error: 'Photo request cancelled.' }, 499);
    const key = species.toLowerCase();
    let entry = cache.get(key);
    try {
      if (pending.has(key)) {
        try { await pending.get(key); } catch { }
        entry = cache.get(key);
        if (request.signal.aborted) throw request.signal.reason;
      }
      if (!entry || entry.expires <= now()) {
        const load = candidates(species, request.signal, fetcher).then(photos => {
          if (request.signal.aborted) throw request.signal.reason;
          const loaded = { photos, expires: now() + 3600000, last: entry?.last };
          cache.set(key, loaded);
          if (cache.size > 256) cache.delete(cache.keys().next().value);
          return loaded;
        });
        pending.set(key, load);
        try { entry = await load; }
        finally { if (pending.get(key) === load) pending.delete(key); }
      }
      if (entry.photos.length) {
        const choices = entry.photos.length > 1 ? entry.photos.filter(photo => photo.url !== entry.last) : entry.photos;
        const photo = choices[Math.floor(random() * choices.length)] || choices[0];
        entry.last = photo.url;
        return json(photo);
      }
    } catch { }
    if (request.signal.aborted) return json({ error: 'Photo request cancelled.' }, 499);
    const image = `/api/birds/image?species=${encodeURIComponent(species)}`;
    const metadata = await getBirdImage(new Request(new URL(`${image}&info=1`, request.url), { signal: request.signal }), { env, fetch: fetcher });
    return json({ url: image, ...(metadata.ok ? await metadata.json() : {}) });
  };
}

async function candidates(species, signal, fetcher) {
  const read = async url => {
    const response = await fetcher(url, { headers: { Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Photo provider unavailable'); }
    return response.json();
  };
  const search = new URL('https://api.inaturalist.org/v1/taxa');
  search.search = new URLSearchParams({ q: species, rank: 'species', per_page: '5' }).toString();
  const match = (await read(search)).results?.find(taxon => taxon.name?.toLowerCase() === species.toLowerCase() && Number.isSafeInteger(taxon.id));
  if (!match) return [];
  const taxon = (await read(`https://api.inaturalist.org/v1/taxa/${match.id}`)).results?.find(taxon => taxon.name?.toLowerCase() === species.toLowerCase());
  const photos = new Map();
  for (const { photo } of taxon?.taxon_photos || []) {
    const license = licenses[photo?.license_code];
    if (!license || !Number.isSafeInteger(photo.id)) continue;
    try {
      const url = new URL(photo.large_url || photo.medium_url);
      if (url.protocol !== 'https:' || !['inaturalist-open-data.s3.amazonaws.com', 'static.inaturalist.org'].includes(url.hostname)) continue;
      photos.set(url.href, { url: url.href, authorName: photo.attribution_name || photo.attribution || 'iNaturalist contributor', authorURL: `https://www.inaturalist.org/photos/${photo.id}`, licenseName: license[0], licenseURL: license[1], sourceProvider: 'iNaturalist' });
    } catch { }
  }
  return [...photos.values()];
}
