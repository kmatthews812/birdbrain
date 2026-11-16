'use client';

import { useEffect, useState } from 'react';
import { readDetection, shouldReload } from '../lib/detections.mjs';

export default function Board({ version }) {
  const [online, setOnline] = useState(false);
  const [bird, setBird] = useState(null);
  const [sequence, setSequence] = useState(0);

  useEffect(() => {
    const stream = new EventSource('/api/birds/stream');
    stream.addEventListener('connected', () => setOnline(true));
    stream.onerror = () => setOnline(false);
    stream.addEventListener('detection', (event) => {
      const detection = readDetection(event.data);
      if (!detection) return;
      setBird(detection);
      setSequence((value) => value + 1);
    });

    const controller = new AbortController();
    const checkVersion = async () => {
      try {
        const response = await fetch('/api/version', {
          cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) return;
        const running = await response.json();
        if (shouldReload(version, running.version)) window.location.reload();
      } catch {
        // The production service can briefly be offline during a release switch.
      }
    };
    const timer = setInterval(checkVersion, 10000);
    document.addEventListener('visibilitychange', checkVersion);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', checkVersion);
      stream.close();
    };
  }, [version]);

  return (
    <main>
      <header><h1>Birdwatch</h1><p><i data-online={online} />{online ? 'Live' : 'Connecting'}</p></header>
      <section aria-live="polite">
        <div className="rings" key={sequence} data-detected={Boolean(bird)} aria-hidden="true" />
        <div className="caption">
          <h2>{bird ? bird.commonName : 'Listening for birds'}</h2>
          {bird && <p>{Math.round(bird.confidence * 100)}% confidence</p>}
        </div>
      </section>
    </main>
  );
}
