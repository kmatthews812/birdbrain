import './style.css';

export const metadata = { title: 'BirdBrain' };

export default function Layout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
