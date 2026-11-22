import { handleToolRequest } from '../../../lib/server-tools.mjs';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  return handleToolRequest(request);
}
