import assert from 'node:assert/strict';
import test from 'node:test';
import { createSound } from '../lib/sound.mjs';

test('sound requires a user enable, plays decoded audio, and stops on cancellation or mute', async () => {
  const events = [];
  class Context {
    destination = 'speakers';
    async resume() { events.push('resume'); }
    async close() { events.push('close'); }
    async decodeAudioData(bytes) { assert.equal(bytes.byteLength, 2); return 'decoded'; }
    createBufferSource() {
      return { connect(to) { events.push(to); }, start() { events.push(this.buffer); }, stop() { events.push('stop'); this.onended?.(); }, disconnect() { events.push('disconnect'); } };
    }
  }
  const sound = createSound({ Context, fetch: async () => new Response(new Uint8Array([1, 2])) });
  const controller = new AbortController();
  assert.equal(await sound.play('/chirp.wav', controller.signal), false);
  assert.deepEqual(events, []);
  await sound.enable();
  assert.equal(await sound.play('/chirp.wav', controller.signal), true);
  controller.abort();
  assert.deepEqual(events, ['resume', 'speakers', 'decoded', 'stop', 'disconnect']);
  const next = new AbortController();
  await sound.play('/chirp.wav', next.signal);
  sound.mute();
  assert.deepEqual(events.slice(-4), ['speakers', 'decoded', 'stop', 'disconnect']);
  assert.equal(await sound.play('/chirp.wav', next.signal), false);
  await sound.dispose();
  assert.equal(events.at(-1), 'close');
});

test('aborting while audio loads prevents playback', async () => {
  let decode;
  const controller = new AbortController();
  const sound = createSound({ Context: class {
    async resume() {}
    decodeAudioData() { return new Promise(resolve => { decode = resolve; }); }
    createBufferSource() { assert.fail('must not play a cancelled clip'); }
  }, fetch: async () => new Response('audio') });
  await sound.enable();
  const playing = sound.play('/chirp.wav', controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  decode('buffer');
  await assert.rejects(playing, { name: 'AbortError' });
});
