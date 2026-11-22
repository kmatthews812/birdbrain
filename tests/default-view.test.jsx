import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import DefaultView from '../visualizations/default-view.jsx';

async function mount(t, fetcher, strict = false) {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.mock.method(globalThis, 'fetch', fetcher);
  const root = createRoot(document.getElementById('root'));
  const controller = new AbortController();
  t.after(async () => { controller.abort(); await act(() => root.unmount()); dom.window.close(); });
  const view = <DefaultView bird={{ commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos' }} signal={controller.signal} />;
  await act(() => root.render(strict ? <React.StrictMode>{view}</React.StrictMode> : view));
  return controller;
}

test('shows the species photo, sourced fact and photo attribution without invented confidence', async t => {
  const calls = [];
  await mount(t, async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.startsWith('/api/birds/photo?') ? { url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/123/large.jpg', authorName: 'Ada', authorURL: 'https://example.com/ada', licenseName: 'CC0', licenseURL: 'https://example.com/license' } : { fact: 'Crows recognize faces.', sources: [{ title: 'Bird research', url: 'https://example.com/crows' }] });
  });
  assert.equal(document.querySelector('h2').textContent, 'American Crow');
  assert.equal(document.querySelector('img').getAttribute('src'), 'https://inaturalist-open-data.s3.amazonaws.com/photos/123/large.jpg');
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
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelector('.photo-placeholder').textContent, 'No photo available yet');
  assert.equal(document.querySelector('h2').textContent, 'American Crow');
});

test('shows loading and ignores a fact that arrives after cancellation', async t => {
  let resolveFact;
  const controller = await mount(t, url => url.startsWith('/api/birds/photo?') ? Promise.resolve(Response.json({ url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/123/large.jpg' })) : new Promise(resolve => { resolveFact = resolve; }));
  assert.equal(document.querySelector('.fun-fact').textContent, 'Finding a fun fact…');
  await act(async () => { controller.abort(); resolveFact(Response.json({ fact: 'Late fact', sources: [] })); });
  assert.equal(document.querySelector('.fun-fact').textContent, 'Finding a fun fact…');
});


test('requests one fresh fact and photo during development StrictMode replay', async t => {
  let facts = 0, photos = 0;
  await mount(t, async url => {
    if (url.startsWith('/api/birds/photo?')) { photos++; return Response.json({ url: '/photo.jpg' }); }
    facts++;
    return Response.json({ fact: 'Fresh fact', sources: [] });
  }, true);
  assert.equal(facts, 1);
  assert.equal(photos, 1);
  assert.equal(document.querySelector('.fun-fact').textContent, 'Fresh fact');
});
