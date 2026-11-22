'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { readDetection, shouldReload } from '../lib/detections.mjs';
import { selectVisualization, visualizations } from '../visualizations/index.jsx';
import Player from './player.jsx';
import { createSound } from '../lib/sound.mjs';

export default function Board({ version }) {
  const [sound] = useState(() => createSound());
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundError, setSoundError] = useState('');
  useEffect(() => () => { sound.dispose(); }, [sound]);
  async function toggleSound() {
    try {
      if (soundEnabled) sound.mute();
      else await sound.enable();
      setSoundEnabled(!soundEnabled);
      setSoundError('');
    } catch { setSoundError('Sound could not start. Tap to try again.'); }
  }
  const [online, setOnline] = useState(false);
  const [bird, setBird] = useState(null);
  const [sequence, setSequence] = useState(0);
  const [visualization, setVisualization] = useState(null);
  const previous = useRef(null);
  const finish = useCallback(() => setBird(null), []);

  useEffect(() => {
    const stream = new EventSource('/api/birds/stream');
    const seen = new Set();
    stream.addEventListener('connected', () => setOnline(true));
    stream.onerror = () => setOnline(false);
    stream.addEventListener('detection', (event) => {
      const detection = readDetection(event.data);
      if (!detection || (detection.id != null && seen.has(detection.id))) return;
      if (detection.id != null) {
        seen.add(detection.id);
        if (seen.size > 100) seen.delete(seen.values().next().value);
      }
      const next = selectVisualization(visualizations, previous.current);
      previous.current = next?.id;
      setVisualization(next);
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
      <header>
        <div className="brand">
          <img src="/birdbrain.png" alt="BirdBrain mascot with a popped-open brain" width="64" height="64" />
          <h1>BirdBrain</h1>
        </div>
        <p><i data-online={online} />{online ? 'Live' : 'Connecting'}</p>
      </header>
      <section aria-live="polite">
        {bird && visualization ? <Player key={sequence} visualization={visualization} bird={bird} onDone={finish} sound={sound} /> : <>
          <div className="rings" aria-hidden="true" />
          <div className="caption"><h2>Listening for owls</h2></div>
        </>}
      </section>
      <footer>
        <button type="button" onClick={toggleSound} aria-pressed={soundEnabled}>{soundEnabled ? 'Mute sound' : 'Enable sound'}</button>
        {soundError && <p role="status">{soundError}</p>}
      </footer>
    </main>
  );
}
