import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.argv[2];
const state = JSON.parse(readFileSync(join(root, 'data', 'state.json'), 'utf8'));
if (!/^[0-9a-f]{40}$/.test(state.active)) throw new Error('No active release');

const release = join(root, 'data', 'releases', state.active);
const child = spawn(process.execPath, [
  join(release, 'node_modules', 'next', 'dist', 'bin', 'next'),
  'start', '--hostname', '0.0.0.0', '--port', '3000',
], {
  cwd: release,
  env: { ...process.env, BIRD_APP_VERSION: state.active },
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
