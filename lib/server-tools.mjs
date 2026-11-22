function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function birdnetUrl(input, base) {
  if (!input || typeof input.path !== 'string' || !/^\/api\/v2\/[a-zA-Z0-9_/-]+$/.test(input.path)) return null;
  const params = input.params ?? {};
  if (typeof params !== 'object' || Array.isArray(params) ||
      Object.values(params).some(value => !['string', 'number', 'boolean'].includes(typeof value))) return null;
  const url = new URL(input.path, base);
  url.search = new URLSearchParams(params).toString();
  return url;
}

export async function handleToolRequest(request, { env = process.env, fetch: fetcher = globalThis.fetch } = {}) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${request.headers.get('host') || url.host}`;
  if (request.headers.get('origin') !== origin) {
    return json({ error: 'Same-origin requests are required.' }, 403);
  }
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Expected a JSON tool request.' }, 400); }
  if (body?.tool !== 'birdnet') return json({ error: 'Unknown tool.' }, 400);

  try {
    const url = birdnetUrl(body.input, env.BIRDNET_BASE_URL || 'http://127.0.0.1:8080');
    if (!url) return json({ error: 'Invalid BirdNET query.' }, 400);
    const headers = { Accept: 'application/json' };
    if (env.BIRDNET_TOKEN) headers.Authorization = `Bearer ${env.BIRDNET_TOKEN}`;
    const response = await fetcher(url, {
      method: 'GET', headers, cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Upstream failure');
    }
    return json({ result: await response.json() });
  } catch {
    return json({ error: 'The upstream service could not complete this request.' }, 502);
  }
}
