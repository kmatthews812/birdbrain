import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import CelebrityDeathMatch from '../visualizations/celebrity-death-match.jsx';

const bird = { commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos' };
const previousBird = { commonName: 'Barn Owl', scientificName: 'Tyto alba' };
async function mount(t, image, opponent = previousBird, strict = false) {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  const controller = new AbortController();
  t.after(async () => { controller.abort(); await act(() => root.unmount()); dom.window.close(); });
  const view = <CelebrityDeathMatch bird={bird} previousBird={opponent} tools={{ image }} signal={controller.signal} />;
  await act(() => root.render(strict ? <React.StrictMode>{view}</React.StrictMode> : view));
  return controller;
}

test('requests a looping claymation GIF of the current and previous species, then displays it', async t => {
  let resolveImage;
  const calls = [];
  await mount(t, input => { calls.push(input); return new Promise(resolve => { resolveImage = resolve; }); });
  assert.equal(document.querySelector('h2').textContent, 'American Crow vs. Barn Owl');
  assert.equal(document.querySelector('.match-status').textContent, 'Building the clay arena…');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].format, 'gif');
  assert.match(calls[0].prompt, /Celebrity Deathmatch-inspired/);
  assert.match(calls[0].prompt, /stop-motion claymation/);
  assert.match(calls[0].prompt, /American Crow.*Corvus brachyrhynchos/);
  assert.match(calls[0].prompt, /Barn Owl.*Tyto alba/);
  assert.match(calls[0].prompt, /looping animated GIF/);
  assert.match(calls[0].prompt, /no blood/i);
  await act(() => resolveImage({ data: [{ b64_json: 'R0lGODlh' }] }));
  assert.equal(document.querySelector('img').getAttribute('src'), 'data:image/gif;base64,R0lGODlh');
  assert.equal(document.querySelector('img').alt, 'American Crow and Barn Owl in a playful claymation wrestling match');
  assert.equal(document.querySelector('.match-status'), null);
});

test('waits for a previous bird without calling OpenAI', async t => {
  let calls = 0;
  await mount(t, () => { calls++; }, null);
  assert.equal(calls, 0);
  assert.equal(document.querySelector('h2').textContent, 'American Crow enters the ring');
  assert.equal(document.querySelector('.match-status').textContent, 'Waiting for another bird to make a match.');
  assert.equal(document.querySelector('img'), null);
});

test('shows a friendly fallback when image generation fails', async t => {
  await mount(t, async () => { throw new Error('upstream unavailable'); });
  assert.equal(document.querySelector('h2').textContent, 'American Crow vs. Barn Owl');
  assert.equal(document.querySelector('.match-status').textContent, 'The match could not be generated. The birds will be back!');
  assert.equal(document.querySelector('img'), null);
});

test('treats an image response without GIF data as a failed match', async t => {
  await mount(t, async () => ({ data: [] }));
  assert.equal(document.querySelector('.match-status').textContent, 'The match could not be generated. The birds will be back!');
  assert.equal(document.querySelector('img'), null);
});

test('does not display an image that arrives after the visualization was cancelled', async t => {
  let resolveImage;
  const controller = await mount(t, () => new Promise(resolve => { resolveImage = resolve; }));
  await act(async () => { controller.abort(); resolveImage({ data: [{ b64_json: 'R0lGODlh' }] }); });
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelector('.match-status').textContent, 'Building the clay arena…');
});


test('makes one image request during development StrictMode effect replay', async t => {
  let calls = 0;
  await mount(t, async () => { calls++; return { data: [{ b64_json: 'R0lGODlh' }] }; }, previousBird, true);
  assert.equal(calls, 1);
  assert.equal(document.querySelector('img').getAttribute('src'), 'data:image/gif;base64,R0lGODlh');
});
