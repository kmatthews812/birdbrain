import assert from 'node:assert/strict';
import test from 'node:test';
import { GET } from '../app/api/birds/stream/route.js';

test('relays connected, heartbeat and complete detection events without buffering or rewriting', async (t) => {
  const events = 'event: connected\ndata: {}\n\nevent: heartbeat\ndata: {}\n\nevent: detection\ndata: {"id":1015,"commonName":"Red-shouldered Hawk","confidence":0.99}\n\n';
  const controller = new AbortController();
  const oldBase = process.env.BIRDNET_BASE_URL;
  const oldToken = process.env.BIRDNET_TOKEN;
  process.env.BIRDNET_BASE_URL = 'http://birdnet.test:8080';
  process.env.BIRDNET_TOKEN = 'test-token';
  t.after(() => {
    for (const [name, value] of [['BIRDNET_BASE_URL', oldBase], ['BIRDNET_TOKEN', oldToken]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
  const request = new Request('http://birdbrain.test/api/birds/stream', { signal: controller.signal });
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'http://birdnet.test:8080/api/v2/detections/stream');
    assert.deepEqual(options.headers, { Accept: 'text/event-stream', Authorization: 'Bearer test-token' });
    assert.equal(options.signal, request.signal);
    assert.equal(options.redirect, 'error');
    return new Response(events, { headers: { 'Content-Type': 'text/event-stream' } });
  });
  const response = await GET(request);
  assert.equal(response.headers.get('Content-Type'), 'text/event-stream');
  assert.equal(response.headers.get('Cache-Control'), 'no-cache, no-transform');
  assert.equal(await response.text(), events);
});

test('upstream outages and non-stream replies tell EventSource to reconnect after five seconds', async (t) => {
  for (const upstream of [() => { throw new Error('offline'); }, () => new Response('forbidden', { status: 403 }), () => Response.json({})]) {
    const mock = t.mock.method(globalThis, 'fetch', upstream);
    const response = await GET(new Request('http://birdbrain.test/api/birds/stream'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'text/event-stream');
    assert.equal(await response.text(), 'retry: 5000\n\n');
    mock.mock.restore();
  }
});
