import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const launcher = resolve('deploy/Start-BirdBrain.mjs');
const commit = 'a'.repeat(40);

async function fixture(t, marker = commit) {
  const root = await mkdtemp(join(tmpdir(), 'birdbrain-launcher-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = join(root, 'data', 'app');
  const bin = join(app, 'node_modules', 'next', 'dist', 'bin');
  await mkdir(bin, { recursive: true });
  await mkdir(join(app, '.next'), { recursive: true });
  if (marker !== null) await writeFile(join(app, '.next', 'BIRD_APP_VERSION'), marker);
  const output = join(root, 'launches.jsonl');
  await writeFile(join(bin, 'next'), `
    const fs = require('node:fs');
    fs.appendFileSync(process.env.LAUNCH_OUTPUT, JSON.stringify({
      cwd: process.cwd(), args: process.argv.slice(2),
      version: process.env.BIRD_APP_VERSION, inherited: process.env.BIRD_TEST_VALUE,
      localEnvFile: fs.readFileSync('.env.local', 'utf8')
    }) + '\\n');
    process.exit(Number(process.env.CHILD_EXIT || 0));
  `);
  await writeFile(join(app, '.env.local'), 'LOCAL_TEST_VALUE=retained\n');
  return { root, app, output };
}

function run(root, output, extra = {}) {
  return spawnSync(process.execPath, [launcher, root], {
    env: { ...process.env, LAUNCH_OUTPUT: output, BIRD_TEST_VALUE: 'inherited', BIRD_APP_VERSION: 'stale', ...extra },
    encoding: 'utf8', timeout: 10000,
  });
}

test('launches exactly one Next server from the stable checkout with its built version', async (t) => {
  const { root, app, output } = await fixture(t);
  const result = run(root, output);
  assert.equal(result.status, 0, result.stderr);
  const launches = (await readFile(output, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(launches, [{
    cwd: await realpath(app), args: ['start', '--hostname', '0.0.0.0', '--port', '3000'],
    version: commit, inherited: 'inherited', localEnvFile: 'LOCAL_TEST_VALUE=retained\n',
  }]);
});

test('does not launch an unbuilt checkout or an invalid version marker', async (t) => {
  for (const marker of [null, '', '../old-release', 'a'.repeat(39)]) {
    const { root, output } = await fixture(t, marker);
    const result = run(root, output);
    assert.equal(result.status, 1);
    await assert.rejects(readFile(output), { code: 'ENOENT' });
  }
});

test('propagates the server exit code to the Windows service wrapper', async (t) => {
  const { root, output } = await fixture(t);
  assert.equal(run(root, output, { CHILD_EXIT: '7' }).status, 7);
});
