import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GET } from '../app/api/version/route.js';

test('reports each accepted checkout version without restarting the dev server', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'birdbrain-version-'));
  t.mock.method(process, 'cwd', () => directory);
  const old = process.env.BIRD_APP_VERSION;
  process.env.BIRD_APP_VERSION = 'legacy';
  t.after(async () => { if (old === undefined) delete process.env.BIRD_APP_VERSION; else process.env.BIRD_APP_VERSION = old; await rm(directory, { recursive: true, force: true }); });
  assert.deepEqual(await GET().json(), { version: 'legacy' });
  for (const sha of ['a'.repeat(40), 'b'.repeat(40)]) {
    await writeFile(join(directory, '.birdbrain-version'), sha + '\n');
    assert.deepEqual(await GET().json(), { version: sha });
  }
  assert.equal(GET().headers.get('Cache-Control'), 'no-store');
});
