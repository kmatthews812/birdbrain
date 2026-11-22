import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import RecentHistory from '../app/recent-history.jsx';

const crow = { id: 1, commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos', confidence: .9, timestamp: '2026-11-22T09:47:52-08:00' };
async function mount(t, fetcher) {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.mock.method(globalThis, 'fetch', fetcher);
  const oldTZ = process.env.TZ; process.env.TZ = 'UTC';
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(() => root.unmount()); dom.window.close(); if (oldTZ === undefined) delete process.env.TZ; else process.env.TZ = oldTZ; });
  const selected = [];
  const render = async detection => { await act(() => root.render(<RecentHistory detection={detection} onSelect={bird => selected.push(bird)} />)); };
  await render(null);
  return { render, selected };
}

test('lists individual sightings newest first with exact readable times and replays the clicked detection', async t => {
  const newer = { ...crow, id: 2, timestamp: '2026-11-22T10:00:01-08:00' };
  const { selected } = await mount(t, async () => Response.json({ birds: [crow, newer] }));
  assert.deepEqual([...document.querySelectorAll('time')].map(el => el.textContent), ['Nov 22, 2026, 6:00:01 PM UTC', 'Nov 22, 2026, 5:47:52 PM UTC']);
  assert.equal(document.querySelector('time').dateTime, newer.timestamp);
  assert.equal(document.querySelectorAll('li').length, 2);
  await act(() => document.querySelector('li button').click());
  assert.deepEqual(selected, [newer]);
});

test('merges live detections with late history, deduplicates IDs and retains the newest 30', async t => {
  let resolve;
  const { render } = await mount(t, () => new Promise(done => { resolve = done; }));
  assert.equal(document.querySelector('.recent-status').textContent, 'Loading recent sightings…');
  const live = { ...crow, id: 100, timestamp: '2026-11-23T01:00:00Z' };
  await render(live);
  await act(() => resolve(Response.json({ birds: [live, ...Array.from({ length: 35 }, (_, i) => ({ ...crow, id: i }))] })));
  assert.equal(document.querySelectorAll('li').length, 30);
  assert.equal(document.querySelector('time').dateTime, live.timestamp);
  await render({ ...live });
  assert.equal(document.querySelectorAll('li').length, 30);
});

test('can retry a failed history request and shows an empty state', async t => {
  let calls = 0;
  await mount(t, async () => ++calls === 1 ? Response.json({}, { status: 502 }) : Response.json({ birds: [] }));
  assert.equal(document.querySelector('.recent-status').textContent, 'Could not load recent sightings.');
  await act(() => document.querySelector('button').click());
  assert.equal(document.querySelector('.recent-status').textContent, 'No recent sightings yet.');
});
