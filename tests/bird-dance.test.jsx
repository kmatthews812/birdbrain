import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import BirdDance from '../visualizations/bird-dance.jsx';

const bird = { commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos' };
async function mount(t, image, strict = false) {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  const controller = new AbortController();
  t.after(async () => { controller.abort(); await act(() => root.unmount()); dom.window.close(); });
  const view = <BirdDance bird={bird} tools={{ image }} signal={controller.signal} />;
  await act(() => root.render(strict ? <React.StrictMode>{view}</React.StrictMode> : view));
  return controller;
}

test('generates and displays a looping dance GIF for the current bird without an opponent', async t => {
  const calls = [];
  let release;
  await mount(t, input => { calls.push(input); return new Promise(resolve => { release = resolve; }); });
  assert.equal(document.querySelector('h2').textContent, 'American Crow');
  assert.equal(document.querySelector('.dance-placeholder').textContent, 'Teaching this bird some moves…');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].format, 'gif');
  assert.match(calls[0].prompt, /American Crow.*Corvus brachyrhynchos/);
  assert.match(calls[0].prompt, /looping animated GIF/);
  assert.match(calls[0].prompt, /dancing/);
  assert.match(calls[0].prompt, /real species markings/);
  assert.match(calls[0].prompt, /child-friendly/);
  await act(() => release({ data: [{ b64_json: 'R0lGODlh' }] }));
  assert.equal(document.querySelector('img').getAttribute('src'), 'data:image/gif;base64,R0lGODlh');
  assert.equal(document.querySelector('img').alt, 'American Crow doing a cheerful dance');
  assert.equal(document.querySelector('.dance-placeholder'), null);
});

test('keeps the bird name and shows a friendly message when generation fails', async t => {
  await mount(t, async () => { throw new Error('unavailable'); });
  assert.equal(document.querySelector('h2').textContent, 'American Crow');
  assert.equal(document.querySelector('.dance-placeholder').textContent, 'The dance could not be generated. This bird will try again next time!');
  assert.equal(document.querySelector('img'), null);
});

test('treats missing GIF data as a generation failure', async t => {
  await mount(t, async () => ({ data: [] }));
  assert.equal(document.querySelector('.dance-placeholder').textContent, 'The dance could not be generated. This bird will try again next time!');
});

test('ignores a generated GIF that arrives after cancellation', async t => {
  let release;
  const controller = await mount(t, () => new Promise(resolve => { release = resolve; }));
  await act(async () => { controller.abort(); release({ data: [{ b64_json: 'R0lGODlh' }] }); });
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelector('.dance-placeholder').textContent, 'Teaching this bird some moves…');
});

test('makes one image request during development StrictMode effect replay', async t => {
  let calls = 0;
  await mount(t, async () => { calls++; return { data: [{ b64_json: 'R0lGODlh' }] }; }, true);
  assert.equal(calls, 1);
  assert.equal(document.querySelector('img').getAttribute('src'), 'data:image/gif;base64,R0lGODlh');
});
