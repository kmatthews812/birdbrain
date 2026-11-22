import Board from './board';
import { readAppVersion } from '../lib/version.mjs';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <Board version={readAppVersion()} />;
}
