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
