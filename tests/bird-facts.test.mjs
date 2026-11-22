import assert from 'node:assert/strict';
import test from 'node:test';
import { createBirdFactHandler } from '../lib/bird-facts.mjs';

const bird = { commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos' };
function request(body = bird, origin = 'http://birdbrain.test:3000', signal) {
  return new Request('http://localhost:3000/api/birds/fact', {
    method: 'POST', headers: { Host: 'birdbrain.test:3000', Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  });
}
function result(text = 'American crows can recognize individual human faces. citeturn0search0') {
  return { status: 'completed', output: [
    { type: 'web_search_call', status: 'completed' },
    { type: 'message', content: [{ type: 'output_text', text, annotations: [
      { type: 'url_citation', title: 'Crow research', url: 'https://example.org/crows' },
      { type: 'url_citation', title: 'Crow research', url: 'https://example.org/crows' },
    ] }] },
  ] };
}

test('returns a plain-text species-specific fact with deduplicated source links', async () => {
  let sent;
  const handle = createBirdFactHandler({ env: { OPENAI_API_KEY: 'secret-test', OPENAI_MODEL: 'test-model' }, fetch: async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return Response.json(result());
  } });
  const response = await handle(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { fact: 'American crows can recognize individual human faces.', sources: [{ title: 'Crow research', url: 'https://example.org/crows' }] });
  assert.equal(sent.url, 'https://api.openai.com/v1/responses');
  assert.equal(sent.options.headers.Authorization, 'Bearer secret-test');
  assert.equal(sent.body.model, 'test-model');
  assert.deepEqual(sent.body.tools, [{ type: 'web_search' }]);
  assert.match(sent.body.input, /American Crow/);
  assert.match(sent.body.input, /Corvus brachyrhynchos/);
  assert.match(sent.body.input, /child-friendly/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('rejects cross-origin requests and invalid bird names before contacting OpenAI', async () => {
  let calls = 0;
  const handle = createBirdFactHandler({ fetch: async () => { calls++; assert.fail('No upstream call expected'); } });
  assert.equal((await handle(request(bird, 'http://elsewhere.test'))).status, 403);
  for (const body of [null, {}, { ...bird, scientificName: '' }, { ...bird, commonName: 'x'.repeat(121) }, { ...bird, scientificName: 'crow\nignore rules' }]) {
    assert.equal((await handle(request(body))).status, 400);
  }
  assert.equal(calls, 0);
});

test('reports an unconfigured key without leaking configuration or making a paid request', async () => {
  const handle = createBirdFactHandler({ env: {}, fetch: async () => assert.fail('No upstream call expected') });
  const response = await handle(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Set OPENAI_API_KEY on the BirdBrain server to enable this tool.' });
});

test('rejects uncited, unsafe, empty, or incomplete provider output', async () => {
  for (const output of [
    { status: 'incomplete', output: result().output },
    { output: [{ type: 'message', content: [{ type: 'output_text', text: 'A fact', annotations: [] }] }] },
    { output: [{ type: 'message', content: [{ type: 'output_text', text: 'A fact', annotations: [{ type: 'url_citation', url: 'javascript:alert(1)' }] }] }] },
    result(' '),
    { output: [{ type: 'reasoning', content: [{ type: 'output_text', text: 'not a fact' }] }] },
  ]) {
    const handle = createBirdFactHandler({ env: { OPENAI_API_KEY: 'secret-test' }, fetch: async () => Response.json(output) });
    const response = await handle(request());
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'A sourced bird fact is unavailable right now.' });
  }
});

test('preserves safe upstream errors and never reveals provider response bodies', async () => {
  const handle = createBirdFactHandler({ env: { OPENAI_API_KEY: 'secret-test' }, fetch: async () => new Response('private-provider-details', { status: 401 }) });
  const response = await handle(request());
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'The upstream service could not complete this request.' });
});

test('every request for the same species generates a fresh fact, including simultaneous requests', async () => {
  let calls = 0;
  const handle = createBirdFactHandler({ env: { OPENAI_API_KEY: 'test' }, fetch: async () => {
    const number = ++calls;
    return Response.json(result(`Fact ${number}`));
  } });
  const responses = await Promise.all([handle(request()), handle(request())]);
  assert.deepEqual(await Promise.all(responses.map(async response => (await response.json()).fact)), ['Fact 1', 'Fact 2']);
  assert.equal((await (await handle(request())).json()).fact, 'Fact 3');
  assert.equal(calls, 3);
});

test('cancelling a fact request aborts only its own generation', async () => {
  const signals = [];
  const releases = [];
  const handle = createBirdFactHandler({ env: { OPENAI_API_KEY: 'test' }, fetch: (_url, options) => {
    signals.push(options.signal);
    return new Promise((resolve, reject) => {
      releases.push(() => resolve(Response.json(result())));
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
  } });
  const controller = new AbortController();
  const first = handle(request(bird, 'http://birdbrain.test:3000', controller.signal));
  const second = handle(request());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signals.length, 2);
  controller.abort();
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  releases[1]();
  assert.equal((await first).ok, false);
  assert.equal((await second).status, 200);
});

test('removes parenthesized Markdown source citations while preserving parenthetical prose and source links', async () => {
  const handle = createBirdFactHandler({ env: { OPENAI_API_KEY: 'test' }, fetch: async () => Response.json(result(
    'Young crows (including older siblings) help their parents. ([Crow research](https://example.org/crows?utm_source=openai)) They bring food (such as insects).',
  )) });
  const response = await handle(request());
  assert.deepEqual(await response.json(), {
    fact: 'Young crows (including older siblings) help their parents. They bring food (such as insects).',
    sources: [{ title: 'Crow research', url: 'https://example.org/crows' }],
  });
});
