import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readAppVersion() {
  try { return readFileSync(join(process.cwd(), '.birdbrain-version'), 'utf8').trim(); }
  catch { return process.env.BIRD_APP_VERSION || 'development'; }
}
