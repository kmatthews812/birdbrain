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

test('generates text through Responses using a server-only API key and configurable model', async () => {
  const result = {id:'resp_1',output:[{type:'message',content:[{type:'output_text',text:'A cheerful robin.'}]}]};
  const response = await handleToolRequest(request({tool:'generate',input:{prompt:'Describe a robin.'}}), {
    env:{OPENAI_API_KEY:'server-secret',OPENAI_MODEL:'custom-model'},
    fetch:async (url, options) => {
      assert.equal(String(url), 'https://api.openai.com/v1/responses');
      assert.equal(options.method, 'POST');
      assert.deepEqual(options.headers, {'Content-Type':'application/json',Authorization:'Bearer server-secret'});
      assert.deepEqual(JSON.parse(options.body), {model:'custom-model',input:'Describe a robin.',store:false});
      assert.equal(options.signal.aborted, false);
      assert.equal(options.redirect, 'error');
      return Response.json(result);
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {result});
});

test('reports missing OpenAI configuration without making a paid request', async () => {
  const response = await handleToolRequest(request({tool:'generate',input:{prompt:'Bird fact'}}), {env:{},fetch:() => assert.fail('must not fetch')});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {error:'Set OPENAI_API_KEY on the BirdBrain server to enable this tool.'});
});

test('rejects invalid prompts before making a paid request', async () => {
  for (const prompt of [null, '', '   ', 42, 'a'.repeat(12001)]) {
    const response = await handleToolRequest(request({tool:'generate',input:{prompt}}), {env:{OPENAI_API_KEY:'key'},fetch:() => assert.fail('must not fetch')});
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {error:'Provide a prompt between 1 and 12000 characters.'});
  }
});

test('does not expose OpenAI error bodies or credentials', async () => {
  const response = await handleToolRequest(request({tool:'generate',input:{prompt:'Bird fact'}}), {env:{OPENAI_API_KEY:'key'},fetch:async () => new Response('key leaked', {status:401})});
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {error:'The upstream service could not complete this request.'});
});

test('web search forces the hosted search tool and preserves citations in the response', async () => {
  const result = {output:[{type:'message',content:[{type:'output_text',text:'Robins eat worms.',annotations:[{type:'url_citation',url:'https://example.org/robin',title:'Robin'}]}]}]};
  const response = await handleToolRequest(request({tool:'search',input:{prompt:'Find a robin fact'}}), {
    env:{OPENAI_API_KEY:'key'},fetch:async (url, options) => {
      assert.equal(String(url), 'https://api.openai.com/v1/responses');
      assert.deepEqual(JSON.parse(options.body), {model:'gpt-6.2-astra',input:'Find a robin fact',store:false,tools:[{type:'web_search'}],tool_choice:'required'});
      return Response.json(result);
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {result});
});

test('generates PNG and animated GIF assets through the Images API', async () => {
  for (const format of [undefined, 'gif']) {
    const result = {data:[{b64_json:'aW1hZ2U='}]};
    const response = await handleToolRequest(request({tool:'image',input:{prompt:'A dancing robin',format}}), {
      env:{OPENAI_API_KEY:'key'},fetch:async (url, options) => {
        assert.equal(String(url), 'https://api.openai.com/v1/images/generations');
        assert.deepEqual(JSON.parse(options.body), {model:'gpt-image-2.6-flare',prompt:'A dancing robin',n:1,output_format:format || 'png'});
        return Response.json(result);
      },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {result});
  }
});

test('uses the configured image model and rejects unsupported image formats', async () => {
  const response = await handleToolRequest(request({tool:'image',input:{prompt:'A robin'}}), {
    env:{OPENAI_API_KEY:'key',OPENAI_IMAGE_MODEL:'custom-image-model'}, fetch:async (_url, options) => {
      assert.equal(JSON.parse(options.body).model, 'custom-image-model');
      return Response.json({data:[]});
    },
  });
  assert.equal(response.status, 200);
  const invalid = await handleToolRequest(request({tool:'image',input:{prompt:'A robin',format:'exe'}}), {env:{OPENAI_API_KEY:'key'},fetch:() => assert.fail('must not fetch')});
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), {error:'Image format must be png or gif.'});
});
