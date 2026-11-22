import assert from 'node:assert/strict';
import test from 'node:test';
import { createTools } from '../lib/visualization-tools.mjs';

test('tools forward inputs to the server with the visualization cancellation signal', async () => {
  const controller = new AbortController();
  const requests = [];
  const tools = createTools({ signal: controller.signal, fetch: async (url, options) => {
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    return Response.json({ result: { answer: 'result' } });
  } });
  for (const [tool, input] of [['birdnet', { path: '/api/v2/detections/recent' }], ['generate', { prompt: 'bird joke' }], ['search', { prompt: 'bird facts' }], ['image', { prompt: 'dancing robin', format: 'gif' }]]) {
    assert.deepEqual(await tools[tool](input), { answer: 'result' });
    assert.deepEqual(requests.at(-1), { url: '/api/tools', method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { tool, input }, signal: controller.signal });
  }
});

test('tool errors are actionable and cancellation stops future calls', async () => {
  const controller = new AbortController();
  let calls = 0;
  const tools = createTools({ signal: controller.signal, fetch: async () => { calls++; return Response.json({ error: 'OpenAI is not configured' }, { status: 503 }); } });
  await assert.rejects(tools.generate({ prompt: 'hello' }), /OpenAI is not configured/);
  controller.abort();
  await assert.rejects(tools.search({ prompt: 'hello' }), { name: 'AbortError' });
  assert.equal(calls, 1);
});

test('playSound ties audio playback to the visualization lifetime', async () => {
  const controller = new AbortController();
  const calls = [];
  const tools = createTools({ signal: controller.signal, sound: { play: async (...args) => { calls.push(args); return true; } } });
  assert.equal(await tools.playSound('/sounds/chirp.wav'), true);
  assert.deepEqual(calls, [['/sounds/chirp.wav', controller.signal]]);
});
