import { getBirdHistory } from '../../../../lib/bird-catalog.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  return getBirdHistory(request);
}
