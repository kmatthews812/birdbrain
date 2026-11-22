import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaybackQueue } from '../lib/playback-queue.mjs';

function setup() {
  let time = 0, id = 0;
  const timers = new Map();
  const callbacks = [];
  const played = [], counts = [];
  const queue = createPlaybackQueue({
    play: item => played.push({ item, at: time }),
    onPendingChange: count => counts.push(count),
    now: () => time,
    setTimer: (callback, delay) => { callbacks.push(callback); timers.set(++id, { callback, at: time + delay }); return id; },
    clearTimer: handle => timers.delete(handle),
  });
  const advance = ms => {
    time += ms;
    for (const [handle, timer] of [...timers]) {
      if (timer.at <= time) { timers.delete(handle); timer.callback(); }
    }
  };
  return { queue, played, counts, timers, callbacks, advance };
}

test('plays immediately and advances queued birds in FIFO order at thirty-second boundaries', () => {
  const { queue, played, counts, timers, advance } = setup();
  queue.enqueue('crow');
  advance(1000);
  queue.enqueue('owl');
  queue.enqueue('robin');
  assert.deepEqual(played, [{ item: 'crow', at: 0 }]);
  assert.deepEqual(counts, [1, 2]);
  assert.equal(timers.size, 1);
  advance(28999);
  assert.deepEqual(played, [{ item: 'crow', at: 0 }]);
  advance(1);
  assert.deepEqual(played, [{ item: 'crow', at: 0 }, { item: 'owl', at: 30000 }]);
  advance(29999);
  assert.equal(played.length, 2);
  advance(1);
  assert.deepEqual(played, [{ item: 'crow', at: 0 }, { item: 'owl', at: 30000 }, { item: 'robin', at: 60000 }]);
  assert.deepEqual(counts, [1, 2, 1, 0]);
  assert.equal(timers.size, 0);
});

test('keeps the current bird indefinitely without polling and plays a late arrival immediately', () => {
  const { queue, played, timers, advance } = setup();
  queue.enqueue('crow');
  assert.equal(timers.size, 0);
  advance(3600000);
  assert.deepEqual(played, [{ item: 'crow', at: 0 }]);
  queue.enqueue('owl');
  assert.deepEqual(played, [{ item: 'crow', at: 0 }, { item: 'owl', at: 3600000 }]);
  assert.equal(timers.size, 0);
});

test('keeps repeat species as separate queue entries', () => {
  const { queue, played, advance } = setup();
  const first = { id: 1, commonName: 'Crow' }, second = { id: 2, commonName: 'Crow' };
  queue.enqueue(first);
  queue.enqueue(second);
  advance(30000);
  assert.deepEqual(played, [{ item: first, at: 0 }, { item: second, at: 30000 }]);
});

test('a late timer starts only one next bird and gives it a full thirty seconds', () => {
  const { queue, played, advance } = setup();
  queue.enqueue('crow'); queue.enqueue('owl'); queue.enqueue('robin');
  advance(120000);
  assert.deepEqual(played, [{ item: 'crow', at: 0 }, { item: 'owl', at: 120000 }]);
  advance(29999);
  assert.equal(played.length, 2);
  advance(1);
  assert.deepEqual(played.at(-1), { item: 'robin', at: 150000 });
});

test('clearing cancels pending playback and invalidates stale timer callbacks', () => {
  const { queue, played, counts, timers, callbacks, advance } = setup();
  queue.enqueue('crow'); queue.enqueue('owl');
  const stale = callbacks[0];
  queue.clear();
  assert.equal(timers.size, 0);
  assert.deepEqual(counts, [1, 0]);
  advance(1000);
  queue.enqueue('robin'); queue.enqueue('raven');
  stale();
  assert.deepEqual(played, [{ item: 'crow', at: 0 }, { item: 'robin', at: 1000 }]);
  advance(30000);
  assert.deepEqual(played.at(-1), { item: 'raven', at: 31000 });
});

test('waits for first readiness without timers and starts its minimum display period then', () => {
  const { queue, played, counts, timers, advance } = setup();
  const first = { id: 1 }, second = { id: 2 };
  queue.enqueue(first, { ready: false });
  queue.enqueue(second);
  advance(45000);
  assert.deepEqual(played, []);
  assert.equal(timers.size, 0);
  assert.deepEqual(counts, [1, 2]);
  queue.markReady(first);
  assert.deepEqual(played, [{ item: first, at: 45000 }]);
  advance(29999);
  assert.equal(played.length, 1);
  advance(1);
  assert.deepEqual(played, [{ item: first, at: 45000 }, { item: second, at: 75000 }]);
});

test('keeps the current bird until the next is ready and never skips a processing head', () => {
  const { queue, played, timers, advance } = setup();
  const first = { id: 1 }, second = { id: 2 }, third = { id: 3 };
  queue.enqueue(first);
  queue.enqueue(second, { ready: false });
  queue.enqueue(third, { ready: false });
  queue.markReady(third);
  advance(90000);
  assert.deepEqual(played, [{ item: first, at: 0 }]);
  assert.equal(timers.size, 0);
  queue.markReady(second);
  assert.deepEqual(played, [{ item: first, at: 0 }, { item: second, at: 90000 }]);
  advance(29999);
  assert.equal(played.length, 2);
  advance(1);
  assert.deepEqual(played.at(-1), { item: third, at: 120000 });
});

test('readiness before the minimum deadline waits and readiness after clearing is ignored', () => {
  const { queue, played, counts, timers, advance } = setup();
  const first = { id: 1 }, second = { id: 2 };
  queue.enqueue(first);
  queue.enqueue(second, { ready: false });
  advance(5000);
  queue.markReady(second);
  queue.markReady({ id: 2 });
  assert.deepEqual(played, [{ item: first, at: 0 }]);
  assert.equal(timers.size, 1);
  advance(24999);
  assert.equal(played.length, 1);
  queue.clear();
  queue.markReady(second);
  advance(60000);
  assert.deepEqual(played, [{ item: first, at: 0 }]);
  assert.deepEqual(counts, [1, 0]);
  assert.equal(timers.size, 0);
});
