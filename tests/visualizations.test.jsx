import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { selectVisualization, visualizations } from '../visualizations/index.jsx';
import Player from '../app/player.jsx';

test('selects across the registry without immediately repeating a visualization', () => {
  const entries = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
  assert.equal(selectVisualization(entries, null, () => 0).id, 'one');
  assert.equal(selectVisualization(entries, 'one', () => 0).id, 'two');
  assert.equal(selectVisualization(entries, 'one', () => 0.999).id, 'three');
  assert.equal(selectVisualization([entries[0]], 'one').id, 'one');
  assert.equal(selectVisualization([], null), null);
});

test('registered visualizations declare unique IDs, credits, components', () => {
  assert.equal(new Set(visualizations.map(v => v.id)).size, visualizations.length);
  for (const v of visualizations) {
    assert.match(v.id, /^[a-z0-9-]+$/);
    assert.match(v.name, /\S/);
    assert.match(v.createdBy, /\S/);
    assert.equal(typeof v.Component, 'function');
  }
  assert.deepEqual(visualizations.map(({ id, name, createdBy }) => ({ id, name, createdBy })), [{ id: 'default-view', name: 'Default View', createdBy: 'Kevin' }, { id: 'celebrity-death-match', name: 'Celebrity Death Match', createdBy: 'Kevin' }]);
});

test('player passes bird and tools, credits the author, and cleans up when replaced', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById('root'));
  const bird = { id: 42, commonName: 'Robin', confidence: 0.9 };
  let received;
  function Example(props) { received = props; return <h2>{props.bird.commonName}</h2>; }
  const visualization = { id: 'test', name: 'Bird party', createdBy: 'Sam', Component: Example };
  try {
    await act(() => root.render(<Player visualization={visualization} bird={bird} />));
    assert.equal(document.querySelector('h2').textContent, 'Robin');
    assert.equal(document.querySelector('.credit').textContent, 'Bird party · Created by Sam');
    assert.deepEqual(received.bird, bird);
    assert.equal(typeof received.tools.birdnet, 'function');
    assert.equal(received.signal.aborted, false);
    await act(() => root.unmount());
    assert.equal(received.signal.aborted, true);
  } finally { dom.window.close(); }
});

test('a broken visualization shows the bird fallback, cancels tools, and the next one can play', async (t) => {
  const dom = new JSDOM('<div id="root"></div>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  t.mock.method(console, 'error', () => {});
  const root = createRoot(document.getElementById('root'));
  let signal;
  const bird = { commonName: 'Robin', confidence: 0.9 };
  const broken = { id: 'broken', name: 'Oops', createdBy: 'Sam', Component(props) { signal = props.signal; throw new Error('broken'); } };
  try {
    await act(() => root.render(<Player key="first" visualization={broken} bird={bird} />));
    assert.equal(document.querySelector('h2').textContent, 'Robin');
    assert.equal(document.querySelector('[role="status"]').textContent, 'This visualization needs a little help. Listening for the next bird.');
    assert.equal(signal.aborted, true);
    await act(() => root.render(<Player key="next" visualization={visualizations[0]} bird={bird} />));
    assert.equal(document.querySelector('h2').textContent, 'Robin');
    assert.equal(document.querySelector('[role="status"]'), null);
  } finally { await act(() => root.unmount()); dom.window.close(); }
});
