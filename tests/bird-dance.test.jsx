import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import BirdDance from '../visualizations/bird-dance.jsx';

const bird = { commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos' };
async function mount(t, image, strict = false, onReady) {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  const controller = new AbortController();
  t.after(async () => { controller.abort(); await act(() => root.unmount()); dom.window.close(); });
  const view = <BirdDance bird={bird} tools={{ image }} signal={controller.signal} onReady={onReady} />;
  await act(() => root.render(strict ? <React.StrictMode>{view}</React.StrictMode> : view));
  controller.regenerate = () => act(() => root.render(React.cloneElement(view, { key: 'regenerated' })));
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

test('regenerating the same bird uses different creative scene and choreography instructions', async t => {
  t.mock.method(Math, 'random', () => 0);
  const prompts = [];
  const controller = await mount(t, async input => { prompts.push(input.prompt); return { data: [{ b64_json: 'R0lGODlh' }] }; });
  await controller.regenerate();
  assert.equal(prompts.length, 2);
  assert.notEqual(prompts[0], prompts[1]);
  for (const prompt of prompts) {
    assert.match(prompt, /Scene variation:/);
    assert.match(prompt, /American Crow/);
  }
});

test('reports readiness only after the generated GIF loads and ignores loads after cancellation', async t => {
  let ready = 0;
  const controller = await mount(t, async () => ({ data: [{ b64_json: 'R0lGODlh' }] }), false, () => ready++);
  assert.equal(ready, 0);
  await act(() => document.querySelector('img').dispatchEvent(new window.Event('load')));
  assert.equal(ready, 1);
  await act(() => document.querySelector('img').dispatchEvent(new window.Event('load')));
  assert.equal(ready, 1);
  await controller.regenerate();
  controller.abort();
  await act(() => document.querySelector('img').dispatchEvent(new window.Event('load')));
  assert.equal(ready, 1);
});

test('a failed GIF load becomes a ready fallback', async t => {
  let ready = 0;
  await mount(t, async () => ({ data: [{ b64_json: 'bad' }] }), false, () => ready++);
  await act(() => document.querySelector('img').dispatchEvent(new window.Event('error')));
  assert.equal(ready, 1);
  assert.equal(document.querySelector('img'), null);
  assert.equal(document.querySelector('.dance-placeholder').textContent, 'The dance could not be generated. This bird will try again next time!');
});

test('generation failure reports a ready fallback', async t => {
  let ready = 0;
  await mount(t, async () => { throw new Error('failed'); }, false, () => ready++);
  assert.equal(ready, 1);
});
