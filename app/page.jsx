import Board from './board';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <Board version={process.env.BIRD_APP_VERSION || 'development'} />;
}
