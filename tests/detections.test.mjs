import assert from 'node:assert/strict';
import test from 'node:test';
import { readDetection, shouldReload } from '../lib/detections.mjs';

test('accepts a new BirdNET detection with a species and valid confidence', () => {
  assert.deepEqual(readDetection('{"commonName":"American Robin","confidence":0.94}'),
    { commonName: 'American Robin', confidence: 0.94 });
});

test('ignores malformed messages and invalid confidence', () => {
  for (const payload of ['unparseable', 'null', '{}', '{"commonName":"Robin","confidence":2}'])
    assert.equal(readDetection(payload), null);
});

test('reloads only when a running app sees a different release', () => {
  assert.equal(shouldReload('first', 'second'), true);
  assert.equal(shouldReload('first', 'first'), false);
  assert.equal(shouldReload('first', ''), false);
});
