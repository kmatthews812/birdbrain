import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Board from '../app/board.jsx';

test('shows Listening for owls while waiting for a detection', () => {
  const html = renderToStaticMarkup(<Board version="test" />);
  assert.equal(html.match(/<h2>(.*?)<\/h2>/s)?.[1], 'Listening for owls');
});

test('renders the BirdBrain mascot beside the title before the connection status', () => {
  const html = renderToStaticMarkup(<Board version="test" />);
  assert.equal(html.match(/<header>(.*?)<\/header>/s)?.[1],
    '<div class="brand"><img src="/birdbrain.png" alt="BirdBrain mascot with a popped-open brain" width="64" height="64"/><h1>BirdBrain</h1></div><p><i data-online="false"></i>Connecting</p>');
});

test('live detections play credited visualizations once and return to listening after their duration', async (t) => {
  const { JSDOM } = await import('jsdom');
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let resumed = 0;
  window.AudioContext = class { async resume() { resumed++; } async close() {} };
  let source;
  globalThis.EventSource = class extends dom.window.EventTarget {
    constructor(url) { super(); this.url = url; source = this; }
    close() { this.closed = true; }
    emit(type, data) { this.dispatchEvent(new dom.window.MessageEvent(type, { data: JSON.stringify(data) })); }
  };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ version: 'test' }));
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const root = createRoot(document.getElementById('root'));
  try {
    await act(() => root.render(<Board version="test" />));
    assert.equal(source.url, '/api/birds/stream');
    const soundButton = document.querySelector('button');
    assert.equal(soundButton?.textContent, 'Enable sound');
    await act(() => soundButton.click());
    assert.equal(resumed, 1);
    assert.equal(soundButton.textContent, 'Mute sound');
    await act(() => soundButton.click());
    assert.equal(soundButton.textContent, 'Enable sound');
    await act(() => source.emit('connected', {}));
    assert.equal(document.querySelector('header p').textContent, 'Live');
    const bird = { id: 42, commonName: 'Robin', confidence: 0.9 };
    await act(() => source.emit('detection', bird));
    assert.equal(document.querySelector('h2').textContent, 'Robin');
    assert.equal(document.querySelector('.credit')?.textContent, 'Birdsong rings · Created by BirdBrain');
    await act(() => t.mock.timers.tick(15000));
    await act(() => source.emit('detection', bird));
    await act(() => t.mock.timers.tick(5000));
    assert.equal(document.querySelector('h2').textContent, 'Listening for owls');
    await act(() => source.emit('detection', { ...bird, id: 43, commonName: 'Crow' }));
    assert.equal(document.querySelector('h2').textContent, 'Crow');
    await act(() => source.onerror());
    assert.equal(document.querySelector('header p').textContent, 'Connecting');
  } finally {
    await act(() => root.unmount());
    assert.equal(source.closed, true);
    dom.window.close();
  }
});
