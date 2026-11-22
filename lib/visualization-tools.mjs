export function createTools({ signal, sound, fetch: request = globalThis.fetch }) {
  async function call(tool, input) {
    signal.throwIfAborted();
    const response = await request('/api/tools', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, input }), signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Tool request failed');
    return data.result;
  }
  return { playSound: url => sound ? sound.play(url, signal) : Promise.resolve(false), ...Object.fromEntries(['birdnet', 'generate', 'search', 'image'].map(tool => [tool, input => call(tool, input)])) };
}
