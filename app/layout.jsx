import './style.css';

export const metadata = { title: 'Birdwatch' };

export default function Layout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
