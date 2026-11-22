import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Board from '../app/board.jsx';

test('loading server routes and rendering an unhydrated page starts no outbound requests or jobs', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => { calls.push(String(url)); return Response.json({}); });
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  for (const path of ['tools', 'birds/fact', 'birds/photo', 'birds/history', 'birds/recent', 'birds/image', 'birds/stream']) {
    await import(`../app/api/${path}/route.js`);
  }
  const markup = renderToStaticMarkup(<Board version="test" />);
  assert.match(markup, /Listening…/);
  t.mock.timers.tick(3600000);
  await Promise.resolve();
  assert.deepEqual(calls, []);
});
