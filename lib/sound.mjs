export function createSound({ Context, fetch: request = globalThis.fetch } = {}) {
  let context;
  let enabled = false;
  const playing = new Set();
  function mute() {
    enabled = false;
    for (const stop of playing) stop();
  }
  return {
    async enable() {
      const AudioContext = Context || window.AudioContext || window.webkitAudioContext;
      context ||= new AudioContext();
      await context.resume();
      enabled = true;
    },
    mute,
    async play(url, signal) {
      signal.throwIfAborted();
      if (!enabled) return false;
      const response = await request(url, { signal });
      if (!response.ok) throw new Error('Sound could not be loaded');
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      signal.throwIfAborted();
      if (!enabled) return false;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      const stop = () => source.stop();
      source.onended = () => {
        playing.delete(stop);
        signal.removeEventListener('abort', stop);
        source.disconnect();
      };
      playing.add(stop);
      signal.addEventListener('abort', stop, { once: true });
      source.start();
      return true;
    },
    async dispose() { mute(); await context?.close(); context = undefined; },
  };
}
