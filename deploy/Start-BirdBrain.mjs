import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.argv[2];
const app = join(root, 'app');
const version = readFileSync(join(app, '.birdbrain-version'), 'utf8').trim();
if (!/^[0-9a-f]{40}$/.test(version)) throw new Error('No accepted app version');
const child = spawn(process.execPath, [
  join(app, 'node_modules', 'next', 'dist', 'bin', 'next'),
  'dev', '--hostname', '0.0.0.0', '--port', '3000',
], {
  cwd: app,
  env: { ...process.env, NODE_ENV: 'development', BIRD_APP_VERSION: version },
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
