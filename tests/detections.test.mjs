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

test('preserves the complete detection for visualization tools', () => {
  const bird = { id: 1012, commonName: ' Chestnut-backed Chickadee ', scientificName: 'Poecile rufescens', confidence: 0.29, timestamp: '2026-11-22T08:33:32-08:00', speciesCode: 'chbchi', source: { displayName: 'Bird Mic' }, clipName: 'bird.wav' };
  assert.deepEqual(readDetection(JSON.stringify(bird)), { ...bird, commonName: 'Chestnut-backed Chickadee' });
});
