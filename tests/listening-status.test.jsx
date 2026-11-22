import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import ListeningStatus from '../app/listening-status.jsx';

async function mount(t, props = {}) {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.parse('2026-11-22T18:00:00Z') });
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(() => root.unmount()); dom.window.close(); });
  const render = async next => { await act(() => root.render(<ListeningStatus {...next} />)); };
  await render(props);
  return render;
}

test('updates elapsed seconds, minutes and hours with singular and plural units', async t => {
  await mount(t, { timestamp: '2026-11-22T18:00:00Z' });
  assert.equal(document.querySelector('h2').textContent, 'Listening…');
  assert.equal(document.querySelector('p').textContent, 'Last bird sighting was 0 seconds ago');
  await act(() => t.mock.timers.tick(1000));
  assert.equal(document.querySelector('p').textContent, 'Last bird sighting was 1 second ago');
  await act(() => t.mock.timers.tick(58000));
  assert.equal(document.querySelector('p').textContent, 'Last bird sighting was 59 seconds ago');
  await act(() => t.mock.timers.tick(1000));
  assert.equal(document.querySelector('p').textContent, 'Last bird sighting was 1 minute ago');
  await act(() => t.mock.timers.tick(60000));
  assert.equal(document.querySelector('p').textContent, 'Last bird sighting was 2 minutes ago');
  await act(() => t.mock.timers.tick(3480000));
  assert.equal(document.querySelector('p').textContent, 'Last bird sighting was 1 hour ago');
  await act(() => t.mock.timers.tick(3600000));
  assert.equal(document.querySelector('p').textContent, 'Last bird sighting was 2 hours ago');
});

test('distinguishes loading, unavailable and empty sighting history', async t => {
  const render = await mount(t, { timestamp: null, loading: true });
  assert.equal(document.querySelector('p').textContent, 'Checking the last sighting…');
  await render({ timestamp: null, error: true });
  assert.equal(document.querySelector('p').textContent, 'Last sighting time is unavailable.');
  await render({ timestamp: null });
  assert.equal(document.querySelector('p').textContent, 'No bird sightings yet.');
  await render({ timestamp: 'not-a-date' });
  assert.equal(document.querySelector('p').textContent, 'Last sighting time is unavailable.');
});

test('uses the newest timestamp immediately and clamps future sightings to zero seconds', async t => {
  const render = await mount(t, { timestamp: '2026-11-22T17:59:00Z' });
  assert.equal(document.querySelector('p').textContent, 'Last bird sighting was 1 minute ago');
  await render({ timestamp: '2026-11-22T18:00:30Z' });
  assert.equal(document.querySelector('p').textContent, 'Last bird sighting was 0 seconds ago');
});
