import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import DefaultView from '../visualizations/default-view.jsx';

async function mount(t, fetcher) {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.mock.method(globalThis, 'fetch', fetcher);
  const root = createRoot(document.getElementById('root'));
  const controller = new AbortController();
  t.after(async () => { controller.abort(); await act(() => root.unmount()); dom.window.close(); });
  await act(() => root.render(<DefaultView bird={{ commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos' }} signal={controller.signal} />));
  return controller;
}

test('shows the species photo, sourced fact and photo attribution without invented confidence', async t => {
  const calls = [];
  await mount(t, async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.includes('info=1') ? { authorName: 'Ada', authorURL: 'https://example.com/ada', licenseName: 'CC0', licenseURL: 'https://example.com/license' } : { fact: 'Crows recognize faces.', sources: [{ title: 'Bird research', url: 'https://example.com/crows' }] });
  });
  assert.equal(document.querySelector('h2').textContent, 'American Crow');
  assert.equal(document.querySelector('img').getAttribute('src'), '/api/birds/image?species=Corvus%20brachyrhynchos');
  assert.equal(document.querySelector('img').alt, 'American Crow');
  assert.equal(document.querySelector('.fun-fact').textContent, 'Crows recognize faces.');
  assert.deepEqual([...document.querySelectorAll('a')].map(a => [a.textContent, a.href]), [['Ada', 'https://example.com/ada'], ['CC0', 'https://example.com/license'], ['Bird research', 'https://example.com/crows']]);
  assert.equal(document.body.textContent.includes('confidence'), false);
  const request = calls.find(call => call.url === '/api/birds/fact');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), { commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos' });
});

test('keeps bird visible when fact and image are unavailable', async t => {
  await mount(t, async () => Response.json({ error: 'unavailable' }, { status: 502 }));
  assert.equal(document.querySelector('.fun-fact').textContent, 'A fun fact is unavailable right now. Keep listening!');
  await act(() => document.querySelector('img').dispatchEvent(new window.Event('error')));
  assert.equal(document.querySelector('.photo-placeholder').textContent, 'No photo available yet');
  assert.equal(document.querySelector('h2').textContent, 'American Crow');
});

test('shows loading and ignores a fact that arrives after cancellation', async t => {
  let resolveFact;
  const controller = await mount(t, url => url.includes('info=1') ? Promise.resolve(Response.json({})) : new Promise(resolve => { resolveFact = resolve; }));
  assert.equal(document.querySelector('.fun-fact').textContent, 'Finding a fun fact…');
  await act(async () => { controller.abort(); resolveFact(Response.json({ fact: 'Late fact', sources: [] })); });
  assert.equal(document.querySelector('.fun-fact').textContent, 'Finding a fun fact…');
});
