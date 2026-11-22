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
  if (!['birdnet', 'generate'].includes(body?.tool)) return json({ error: 'Unknown tool.' }, 400);

  try {
    let target, options;
    if (body.tool === 'birdnet') {
      target = birdnetUrl(body.input, env.BIRDNET_BASE_URL || 'http://127.0.0.1:8080');
      if (!target) return json({ error: 'Invalid BirdNET query.' }, 400);
      const headers = { Accept: 'application/json' };
      if (env.BIRDNET_TOKEN) headers.Authorization = `Bearer ${env.BIRDNET_TOKEN}`;
      options = { method: 'GET', headers };
    } else {
      const prompt = body.input?.prompt;
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000) {
        return json({ error: 'Provide a prompt between 1 and 12000 characters.' }, 400);
      }
      if (!env.OPENAI_API_KEY) {
        return json({ error: 'Set OPENAI_API_KEY on the BirdBrain server to enable this tool.' }, 503);
      }
      target = 'https://api.openai.com/v1/responses';
      options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-6.2-astra', input: prompt, store: false }),
      };
    }
    const response = await fetcher(target, {
      ...options, cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(body.tool === 'birdnet' ? 15000 : 120000)]),
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
