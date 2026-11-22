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
    if (!pending.length || timer !== null) return;
    const scheduledGeneration = generation;
    timer = setTimer(() => {
      if (scheduledGeneration !== generation) return;
      timer = null;
      const item = pending.shift();
      onPendingChange(pending.length);
      start(item);
      schedule();
    }, Math.max(0, deadline - now()));
  }

  return {
    enqueue(item) {
      if (!active || (!pending.length && now() >= deadline)) {
        start(item);
        return;
      }
      pending.push(item);
      onPendingChange(pending.length);
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
