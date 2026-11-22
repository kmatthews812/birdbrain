import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import Player from '../app/player.jsx';

test('preparing a hidden view cannot play sound and activating it preserves its session', async t => {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(() => root.unmount()); dom.window.close(); });
  let tools, mounts = 0;
  const played = [];
  const sound = { play: async url => { played.push(url); return true; } };
  const visualization = { name: 'Test', createdBy: 'Test', Component: props => {
    tools = props.tools;
    useEffect(() => { mounts++; }, []);
    return <h2>Prepared</h2>;
  }};
  const render = active => act(() => root.render(<Player visualization={visualization} bird={{ commonName: 'Robin' }} sound={sound} active={active} />));
  await render(false);
  assert.equal(await tools.playSound('/sound.mp3'), false);
  assert.deepEqual(played, []);
  const preparedTools = tools;
  await render(true);
  assert.equal(tools, preparedTools);
  assert.equal(mounts, 1);
  assert.equal(await tools.playSound('/sound.mp3'), true);
  assert.deepEqual(played, ['/sound.mp3']);
});

test('a rendering failure makes the completed fallback ready instead of blocking the queue', async t => {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.mock.method(console, 'error', () => {});
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(() => root.unmount()); dom.window.close(); });
  let ready = 0;
  const visualization = { name: 'Broken', createdBy: 'Test', Component: () => { throw new Error('Broken'); } };
  await act(() => root.render(<Player visualization={visualization} bird={{ commonName: 'Robin' }} active={false} onReady={() => ready++} />));
  assert.equal(ready, 1);
  assert.equal(document.querySelector('h2').textContent, 'Robin');
  assert.equal(document.querySelector('[role="status"]').textContent, 'This visualization needs a little help. Listening for the next bird.');
});

test('hiding a cached view stops its audio without discarding the visual session and replay can sound again', async t => {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  t.after(async () => { await act(() => root.unmount()); dom.window.close(); });
  let props;
  const calls = [];
  const sound = { play: async (url, signal) => { calls.push({ url, signal }); return true; } };
  const visualization = { name: 'Cached', createdBy: 'Test', Component: current => { props = current; return <h2>Cached result</h2>; } };
  const render = active => act(() => root.render(<Player visualization={visualization} bird={{ commonName: 'Robin' }} sound={sound} active={active} />));
  await render(true);
  const sessionSignal = props.signal;
  const tools = props.tools;
  await tools.playSound('/first.mp3');
  assert.equal(calls[0].signal.aborted, false);
  await render(false);
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(sessionSignal.aborted, false);
  assert.equal(props.tools, tools);
  assert.equal(await tools.playSound('/hidden.mp3'), false);
  await render(true);
  await tools.playSound('/replayed.mp3');
  assert.deepEqual(calls.map(call => call.url), ['/first.mp3', '/replayed.mp3']);
  assert.equal(calls[1].signal.aborted, false);
  assert.equal(props.signal, sessionSignal);
  await act(() => window.dispatchEvent(new window.Event('pagehide')));
  assert.equal(calls[1].signal.aborted, true);
  assert.equal(sessionSignal.aborted, true);
});
