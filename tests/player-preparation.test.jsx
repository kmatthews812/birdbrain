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
