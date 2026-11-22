export function createPlaybackQueue({
  play,
  onPendingChange = () => {},
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  minimumMs = 30000,
}) {
  let pending = [];
  let active = false;
  let deadline = 0;
  let timer = null;
  let generation = 0;

  function start(item) {
    active = true;
    deadline = now() + minimumMs;
    play(item);
  }

  function schedule() {
    if (!pending[0]?.ready || timer !== null) return;
    if (!active || now() >= deadline) {
      const { item } = pending.shift();
      onPendingChange(pending.length);
      start(item);
      schedule();
      return;
    }
    const scheduledGeneration = generation;
    timer = setTimer(() => {
      if (scheduledGeneration !== generation) return;
      timer = null;
      schedule();
    }, deadline - now());
  }

  return {
    enqueue(item, { ready = true } = {}) {
      if (ready && !pending.length && (!active || now() >= deadline)) {
        start(item);
        return;
      }
      pending.push({ item, ready });
      onPendingChange(pending.length);
      schedule();
    },
    markReady(item) {
      const entry = pending.find(entry => entry.item === item);
      if (!entry) return;
      entry.ready = true;
      schedule();
    },
    clear() {
      generation += 1;
      if (timer !== null) clearTimer(timer);
      timer = null;
      pending = [];
      active = false;
      deadline = 0;
      onPendingChange(0);
    },
  };
}
