import { getRecentBirds } from '../../../../lib/recent-birds.mjs';

export const dynamic = 'force-dynamic';
export const GET = request => getRecentBirds(request);
