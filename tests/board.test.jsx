import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import Board from '../app/board.jsx';
import { visualizations } from '../visualizations/index.jsx';

const robin = { id: 42, commonName: 'Robin', scientificName: 'Turdus migratorius', confidence: 0.9 };
async function mountBoard(t, fetcher = async (url) => Response.json(url === '/api/birds/history' ? { birds: [] } : { version: 'test' }), recent = []) {
  t.mock.method(Math, 'random', () => 0);
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let source, resumed = 0;
  const requests = [];
  window.AudioContext = class { async resume() { resumed++; } async close() {} };
  globalThis.EventSource = class extends dom.window.EventTarget {
    constructor(url) { super(); this.url = url; source = this; }
    close() { this.closed = true; }
    emit(type, data) { this.dispatchEvent(new dom.window.MessageEvent(type, { data: JSON.stringify(data) })); }
  };
  t.mock.method(globalThis, 'fetch', (url, options) => {
    requests.push({ url, options });
    if (url === '/api/tools') return Promise.resolve(Response.json({ result: { data: [{ b64_json: 'R0lGODlh' }] } }));
    if (url === '/api/birds/recent') return Promise.resolve(Response.json({ birds: recent }));
    if (url === '/api/birds/fact') return Promise.resolve(Response.json({ fact: 'A bird fact.', sources: [] }));
    if (url.includes('info=1')) return Promise.resolve(Response.json({}));
    return fetcher(url, options);
  });
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: Date.parse('2026-11-22T18:00:00Z') });
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(() => root.unmount()); assert.equal(source.closed, true); dom.window.close(); });
  await act(() => root.render(<Board version="test" />));
  return { source, requests, resumed: () => resumed, change: async (element, value) => {
    await act(() => { element.value = value; element.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  } };
}

test('starts listening with named visualization disabled and Randomize checked', () => {
  const dom = new JSDOM(renderToStaticMarkup(<Board version="test" />));
  const doc = dom.window.document;
  assert.equal(doc.querySelector('h2').textContent, 'Listening…');
  assert.equal(doc.querySelector('h1').textContent, 'BirdBrain');
  assert.equal(doc.querySelector('header #past-bird')?.id, 'past-bird');
  assert.equal(doc.querySelector('header #show-bird')?.textContent, 'Show bird');
  assert.equal(doc.querySelector('main > .preview-controls'), null);
  assert.equal(doc.querySelector('.brand img').getAttribute('src'), '/birdbrain.png');
  assert.equal(doc.querySelector('#visualization')?.disabled, true);
  assert.equal(doc.querySelector('#visualization option')?.textContent, 'Default View');
  assert.equal(doc.querySelector('#randomize')?.checked, true);
  assert.equal(doc.querySelector('label[for="randomize"]')?.textContent, 'Randomize');
  dom.window.close();
});

test('live detections play credited visualizations once, with sound controls and persist until replaced', async (t) => {
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
  await act(() => t.mock.timers.tick(3600000));
  await act(() => source.emit('detection', robin));
  const displayed = document.querySelector('section article');
  await act(() => source.emit('detection', robin));
  assert.equal(document.querySelector('section article'), displayed);
  assert.equal(document.querySelector('h2').textContent, 'Robin');
  await act(() => source.emit('detection', { ...robin, id: 43, commonName: 'Crow' }));
  assert.match(document.querySelector('h2').textContent, /Crow/);
  await act(() => source.onerror());
  assert.equal(document.querySelector('.connection').textContent, 'Connecting');
});

test('unchecked Randomize uses the chosen visualization for every event; checking resumes random selection', async (t) => {
  visualizations.push({ id: 'test-view', name: 'Test View', createdBy: 'Test', Component: ({ bird }) => <h2>Test: {bird.commonName}</h2> });
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
  assert.equal(document.querySelector('h2').textContent, 'Listening…');
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
  await act(() => t.mock.timers.tick(3600000));
  assert.equal(document.querySelector('h2').textContent, 'Common Raven');
  await act(() => source.emit('detection', robin));
  assert.equal(document.querySelector('h2').textContent, 'Robin');
  assert.equal(document.querySelector('#back-to-live'), null);
  await act(() => show.click());
  assert.deepEqual([...select.options].map(option => option.textContent), ['Choose a bird…', 'Common Raven', 'Robin']);
  await act(() => document.querySelector('#back-to-live').click());
  assert.equal(document.querySelector('h2').textContent, 'Listening…');
  await act(() => source.emit('detection', { ...robin, id: 43 }));
  assert.equal(document.querySelector('h2').textContent, 'Robin');
  await act(() => show.click());
  await act(() => t.mock.timers.tick(3600000));
  assert.equal(document.querySelector('h2').textContent, 'Common Raven');
  await act(() => document.querySelector('#back-to-live').click());
  assert.equal(document.querySelector('h2').textContent, 'Listening…');
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
  visualizations.push({ id: 'pair-test', name: 'Pair test', createdBy: 'Test', Component: props => { received.push(props); return <h2>{props.bird.commonName}</h2>; } });
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
  assert.deepEqual(received.at(-1).bird, owl);
  const next = { ...crow, id: 45 };
  await act(() => source.emit('detection', next));
  assert.deepEqual(received.at(-1).bird, next);
  assert.deepEqual(received.at(-1).previousBird, owl);
});


test('recent sidebar clicks use the selected visualization and live detections appear during manual playback', async t => {
  const selected = [];
  visualizations.push({ id: 'sidebar-test', name: 'Sidebar test', createdBy: 'Test', Component: ({ bird }) => { selected.push(bird); return <h2>{bird.commonName}</h2>; } });
  t.after(() => visualizations.pop());
  const { source, change } = await mountBoard(t, undefined, [robin]);
  assert.equal(document.querySelector('section h2').textContent, 'Listening…');
  await act(() => document.querySelector('#randomize').click());
  await change(document.querySelector('#visualization'), 'sidebar-test');
  await act(() => document.querySelector('aside li button').click());
  assert.deepEqual(selected.at(-1), robin);
  assert.equal(document.querySelector('.preview-status').textContent, 'Manual preview');
  const crow = { id: 43, commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos', confidence: .95, timestamp: '2026-11-23T00:00:00Z' };
  await act(() => source.emit('detection', crow));
  assert.deepEqual([...document.querySelectorAll('.recent-name')].map(el => el.textContent), ['American Crow', 'Robin']);
  assert.deepEqual(selected.at(-1), crow);
  await act(() => document.querySelector('aside li button').click());
  assert.deepEqual(selected.at(-1), crow);
});


test('listening shows elapsed time from real sightings, never from historical replay', async t => {
  const recent = { ...robin, timestamp: '2026-11-22T17:57:00Z' };
  const { source } = await mountBoard(t, undefined, [recent]);
  assert.equal(document.querySelector('.caption p').textContent, 'Last bird sighting was 3 minutes ago');
  await act(() => t.mock.timers.tick(60000));
  assert.equal(document.querySelector('.caption p').textContent, 'Last bird sighting was 4 minutes ago');
  await act(() => document.querySelector('#randomize').click());
  await act(() => source.emit('detection', { ...robin, id: 99, timestamp: '2026-11-22T18:01:00Z' }));
  await act(() => document.querySelectorAll('aside li button')[1].click());
  await act(() => document.querySelector('#back-to-live').click());
  assert.equal(document.querySelector('section h2').textContent, 'Listening…');
  assert.equal(document.querySelector('.caption p').textContent, 'Last bird sighting was 0 seconds ago');
});


test('a new detection of the same species restarts facts and GIFs, while replayed event IDs do not', async t => {
  const { source, requests, change } = await mountBoard(t);
  await act(() => document.querySelector('#randomize').click());
  await act(() => source.emit('detection', robin));
  const firstView = document.querySelector('section article');
  const factCalls = () => requests.filter(call => call.url === '/api/birds/fact');
  assert.equal(factCalls().length, 1);
  await act(() => source.emit('detection', { ...robin, id: 43 }));
  assert.equal(factCalls().length, 2);
  assert.equal(factCalls()[0].options.signal.aborted, true);
  assert.notEqual(document.querySelector('section article'), firstView);
  await act(() => source.emit('detection', { ...robin, id: 43 }));
  assert.equal(factCalls().length, 2);
  await change(document.querySelector('#visualization'), 'celebrity-death-match');
  await act(() => source.emit('detection', { ...robin, id: 44 }));
  const firstMatch = document.querySelector('.match-gif');
  const imageCalls = () => requests.filter(call => call.url === '/api/tools');
  assert.equal(imageCalls().length, 1);
  assert.equal(JSON.parse(imageCalls()[0].options.body).tool, 'image');
  await act(() => source.emit('detection', { ...robin, id: 45 }));
  assert.equal(imageCalls().length, 2);
  assert.equal(imageCalls()[0].options.signal.aborted, true);
  assert.notEqual(document.querySelector('.match-gif'), firstMatch);
});
