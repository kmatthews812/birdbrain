import assert from 'node:assert/strict';
import test from 'node:test';
import { handleToolRequest } from '../lib/server-tools.mjs';

const request = (body, origin = 'http://birdbrain:3000') => new Request('http://birdbrain:3000/api/tools', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body),
});
const birdQuery = { tool: 'birdnet', input: { path: '/api/v2/detections/recent', params: { limit: 2, species: 'American Robin' } } };

test('queries configured BirdNET REST API with encoded parameters and server credentials', async () => {
  const result = [{ id: 12, commonName: 'American Robin' }];
  const response = await handleToolRequest(request(birdQuery), {
    env: { BIRDNET_BASE_URL: 'http://192.168.4.34:8080', BIRDNET_TOKEN: 'private-token' },
    fetch: async (url, options) => {
      assert.equal(String(url), 'http://192.168.4.34:8080/api/v2/detections/recent?limit=2&species=American+Robin');
      assert.equal(options.method, 'GET');
      assert.deepEqual(options.headers, { Accept: 'application/json', Authorization: 'Bearer private-token' });
      assert.equal(options.redirect, 'error');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.signal.aborted, false);
      return Response.json(result);
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { result });
});

test('defaults to BirdNET on the Windows host loopback', async () => {
  const response = await handleToolRequest(request({tool:'birdnet',input:{path:'/api/v2/health'}}), {
    env: {}, fetch: async (url, options) => {
      assert.equal(String(url), 'http://127.0.0.1:8080/api/v2/health');
      assert.deepEqual(options.headers, { Accept: 'application/json' });
      return Response.json({ status:'healthy' });
    },
  });
  assert.deepEqual(await response.json(), {result:{status:'healthy'}});
});

test('rejects arbitrary URLs, path escapes and malformed parameters without upstream requests', async () => {
  for (const input of [null, {}, {path:'http://evil.test/api/v2/health'}, {path:'//evil.test/api/v2/health'},
    {path:'/api/v2/../../settings'}, {path:'/api/v2/%2e%2e/settings'}, {path:'/api/v2/health?x=1'},
    {path:'/api/v2/health',params:[]}, {path:'/api/v2/health',params:{x:{y:1}}}]) {
    const response = await handleToolRequest(request({tool:'birdnet',input}), { fetch: () => assert.fail('must not fetch') });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {error:'Invalid BirdNET query.'});
  }
});

test('rejects cross-origin and malformed requests before contacting tools', async () => {
  for (const origin of ['https://evil.test', 'null', '']) {
    const response = await handleToolRequest(request(birdQuery, origin), { fetch: () => assert.fail('must not fetch') });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {error:'Same-origin requests are required.'});
  }
  const bad = new Request('http://birdbrain:3000/api/tools', {method:'POST',headers:{Origin:'http://birdbrain:3000'},body:'{'});
  assert.equal((await handleToolRequest(bad)).status, 400);
  assert.equal((await handleToolRequest(request({tool:'unknown'}))).status, 400);
});

test('hides upstream failure details and invalid JSON', async () => {
  for (const fetch of [async () => new Response('secret-token', {status:500}), async () => new Response('not json'), async () => {throw new Error('secret-token');}]) {
    const response = await handleToolRequest(request(birdQuery), { env:{}, fetch });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {error:'The upstream service could not complete this request.'});
  }
});

test('propagates request cancellation to upstream requests', async () => {
  const controller = new AbortController();
  const incoming = new Request(request(birdQuery), {signal:controller.signal});
  const result = handleToolRequest(incoming, { env:{}, fetch: async (_url, {signal}) => {
    controller.abort();
    assert.equal(signal.aborted, true);
    throw signal.reason;
  }});
  assert.equal((await result).status, 502);
});

test('tool route delegates POST requests to the tool handler', async () => {
  const { POST } = await import('../app/api/tools/route.js');
  const response = await POST(request({tool:'unknown'}));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {error:'Unknown tool.'});
});

test('accepts LAN origins matching the request Host when Next uses an internal URL', async () => {
  const incoming = new Request('http://localhost:3000/api/tools', {
    method:'POST', headers:{Host:'192.168.4.34:3000',Origin:'http://192.168.4.34:3000'}, body:JSON.stringify({tool:'birdnet',input:{path:'/api/v2/health'}}),
  });
  const response = await handleToolRequest(incoming, {env:{}, fetch:async () => Response.json({status:'healthy'})});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {result:{status:'healthy'}});
});
