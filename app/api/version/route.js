import { readAppVersion } from '../../../lib/version.mjs';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ version: readAppVersion() }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
