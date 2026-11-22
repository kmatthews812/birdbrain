import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import Board from '../app/board.jsx';
import { visualizations } from '../visualizations/index.jsx';

const robin = { id: 42, commonName: 'Robin', scientificName: 'Turdus migratorius', confidence: 0.9 };
async function mountBoard(t, fetcher = async (url) => Response.json(url === '/api/birds/history' ? { birds: [] } : { version: 'test' })) {
  t.mock.method(Math, 'random', () => 0);
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let source, resumed = 0;
  window.AudioContext = class { async resume() { resumed++; } async close() {} };
  globalThis.EventSource = class extends dom.window.EventTarget {
    constructor(url) { super(); this.url = url; source = this; }
    close() { this.closed = true; }
    emit(type, data) { this.dispatchEvent(new dom.window.MessageEvent(type, { data: JSON.stringify(data) })); }
  };
  t.mock.method(globalThis, 'fetch', (url, options) => {
    if (url === '/api/birds/fact') return Promise.resolve(Response.json({ fact: 'A bird fact.', sources: [] }));
    if (url.includes('info=1')) return Promise.resolve(Response.json({}));
    return fetcher(url, options);
  });
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(() => root.unmount()); assert.equal(source.closed, true); dom.window.close(); });
  await act(() => root.render(<Board version="test" />));
  return { source, resumed: () => resumed, change: async (element, value) => {
    await act(() => { element.value = value; element.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  } };
}

test('starts listening with named visualization disabled and Randomize checked', () => {
  const dom = new JSDOM(renderToStaticMarkup(<Board version="test" />));
  const doc = dom.window.document;
  assert.equal(doc.querySelector('h2').textContent, 'Listening for owls');
  assert.equal(doc.querySelector('h1').textContent, 'BirdBrain');
  assert.equal(doc.querySelector('.brand img').getAttribute('src'), '/birdbrain.png');
  assert.equal(doc.querySelector('#visualization')?.disabled, true);
  assert.equal(doc.querySelector('#visualization option')?.textContent, 'Default View');
  assert.equal(doc.querySelector('#randomize')?.checked, true);
  assert.equal(doc.querySelector('label[for="randomize"]')?.textContent, 'Randomize');
  dom.window.close();
});

test('live detections play credited visualizations once, with sound controls and timed return to listening', async (t) => {
  const { source, resumed } = await mountBoard(t);
  assert.equal(source.url, '/api/birds/stream');
  const sound = document.querySelector('footer button');
  assert.equal(sound.textContent, 'Enable sound');
  await act(() => sound.click());
  assert.equal(resumed(), 1);
  assert.equal(sound.textContent, 'Mute sound');
  await act(() => source.emit('connected', {}));
  assert.equal(document.querySelector('.connection').textContent, 'Live');
  await act(() => source.emit('detection', robin));
  assert.equal(document.querySelector('h2').textContent, 'Robin');
  assert.equal(document.querySelector('.credit').textContent, 'Default View · Created by Kevin');
  await act(() => t.mock.timers.tick(visualizations[0].durationMs - 1000));
  await act(() => source.emit('detection', robin));
  await act(() => t.mock.timers.tick(1000));
  assert.equal(document.querySelector('h2').textContent, 'Listening for owls');
  await act(() => source.onerror());
  assert.equal(document.querySelector('.connection').textContent, 'Connecting');
});

test('unchecked Randomize uses the chosen visualization for every event; checking resumes random selection', async (t) => {
  visualizations.push({ id: 'test-view', name: 'Test View', createdBy: 'Test', durationMs: 20000, Component: ({ bird }) => <h2>Test: {bird.commonName}</h2> });
  t.after(() => visualizations.pop());
  t.mock.method(Math, 'random', () => 0);
  const { source, change } = await mountBoard(t);
  const randomize = document.querySelector('#randomize');
  const select = document.querySelector('#visualization');
  await act(() => randomize.click());
  assert.equal(select.disabled, false);
  await change(select, 'test-view');
  await act(() => source.emit('detection', robin));
  assert.equal(document.querySelector('h2').textContent, 'Test: Robin');
  await act(() => source.emit('detection', { ...robin, id: 43 }));
  assert.equal(document.querySelector('h2').textContent, 'Test: Robin');
  await act(() => randomize.click());
  assert.equal(select.disabled, true);
  await act(() => source.emit('detection', { ...robin, id: 44 }));
  assert.equal(document.querySelector('h2').textContent, 'Robin');
});

test('manually previews a historical bird with the selected view, then resumes live detections', async (t) => {
  const historical = { commonName: 'Common Raven', scientificName: 'Corvus corax', count: 7 };
  const { source, change } = await mountBoard(t, async (url) => Response.json(url === '/api/birds/history' ? { birds: [historical] } : { version: 'test' }));
  assert.equal(document.querySelector('h2').textContent, 'Listening for owls');
  const select = document.querySelector('#past-bird');
  assert.deepEqual([...select.options].map(option => option.textContent), ['Choose a bird…', 'Common Raven']);
  const show = document.querySelector('#show-bird');
  assert.equal(show.disabled, true);
  await act(() => document.querySelector('#randomize').click());
  await change(select, 'Corvus corax');
  assert.equal(show.disabled, false);
  await act(() => show.click());
  assert.equal(document.querySelector('h2').textContent, 'Common Raven');
  assert.equal(document.querySelector('.preview-status').textContent, 'Manual preview');
  await act(() => source.emit('detection', robin));
  assert.equal(document.querySelector('h2').textContent, 'Common Raven');
  assert.deepEqual([...select.options].map(option => option.textContent), ['Choose a bird…', 'Common Raven', 'Robin']);
  await act(() => document.querySelector('#back-to-live').click());
  assert.equal(document.querySelector('h2').textContent, 'Listening for owls');
  await act(() => source.emit('detection', { ...robin, id: 43 }));
  assert.equal(document.querySelector('h2').textContent, 'Robin');
  await act(() => show.click());
  await act(() => t.mock.timers.tick(visualizations[0].durationMs));
  assert.equal(document.querySelector('h2').textContent, 'Listening for owls');
  assert.equal(document.querySelector('#back-to-live'), null);
});

test('history errors can be retried without interrupting the event stream', async (t) => {
  let calls = 0;
  const { source } = await mountBoard(t, async () => {
    calls++;
    return calls === 1 ? Response.json({ error: 'offline' }, { status: 502 }) : Response.json({ birds: [] });
  });
  assert.equal(document.querySelector('.history-status').textContent, 'Could not load previously seen birds.');
  assert.equal(document.querySelector('#past-bird').disabled, true);
  await act(() => document.querySelector('#retry-history').click());
  assert.equal(document.querySelector('.history-status').textContent, 'No birds recorded yet.');
  await act(() => source.emit('detection', robin));
  assert.equal(document.querySelector('#past-bird').disabled, false);
  assert.equal(document.querySelector('h2').textContent, 'Robin');
});

test('a late history response keeps species received from the live stream', async (t) => {
  let resolveHistory;
  const { source } = await mountBoard(t, () => new Promise(resolve => { resolveHistory = resolve; }));
  await act(() => source.emit('detection', robin));
  await act(() => resolveHistory(Response.json({ birds: [{ commonName: 'Crow', scientificName: 'Corvus brachyrhynchos' }] })));
  assert.deepEqual([...document.querySelector('#past-bird').options].map(option => option.textContent), ['Choose a bird…', 'Crow', 'Robin']);
});

test('passes the preceding bird to a visualization, ignoring duplicate events and tracking birds during previews', async t => {
  const received = [];
  visualizations.push({ id: 'pair-test', name: 'Pair test', createdBy: 'Test', durationMs: 60000, Component: props => { received.push(props); return <h2>{props.bird.commonName}</h2>; } });
  t.after(() => visualizations.pop());
  const { source, change } = await mountBoard(t);
  await act(() => document.querySelector('#randomize').click());
  await change(document.querySelector('#visualization'), 'pair-test');
  await act(() => source.emit('detection', robin));
  assert.equal(received.at(-1).previousBird, null);
  const crow = { id: 43, commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos', confidence: .95 };
  await act(() => source.emit('detection', crow));
  assert.deepEqual(received.at(-1).previousBird, robin);
  await act(() => source.emit('detection', crow));
  await change(document.querySelector('#past-bird'), robin.scientificName);
  await act(() => document.querySelector('#show-bird').click());
  assert.deepEqual(received.at(-1).previousBird, crow);
  const owl = { id: 44, commonName: 'Barn Owl', scientificName: 'Tyto alba', confidence: .99 };
  await act(() => source.emit('detection', owl));
  assert.deepEqual(received.at(-1).bird, robin);
  await act(() => document.querySelector('#back-to-live').click());
  const next = { ...crow, id: 45 };
  await act(() => source.emit('detection', next));
  assert.deepEqual(received.at(-1).bird, next);
  assert.deepEqual(received.at(-1).previousBird, owl);
});
