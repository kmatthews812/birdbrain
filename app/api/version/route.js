export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ version: process.env.BIRD_APP_VERSION || 'development' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
