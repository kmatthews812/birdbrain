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
  const [seenBirds, setSeenBirds] = useState([]);
  const [pastBird, setPastBird] = useState('');
  const [historyStatus, setHistoryStatus] = useState('loading');
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [preview, setPreview] = useState(false);
  const previewing = useRef(false);
  const previous = useRef(null);
  const lastBird = useRef(null);
  const [previousBird, setPreviousBird] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setHistoryStatus('loading');
    fetch('/api/birds/history', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('History unavailable');
        const data = await response.json();
        if (!Array.isArray(data.birds)) throw new Error('Invalid history');
        if (controller.signal.aborted) return;
        setSeenBirds(current => mergeBirds(data.birds, current));
        setHistoryStatus('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setHistoryStatus('error'); });
    return () => controller.abort();
  }, [historyAttempt]);
  const [randomize, setRandomize] = useState(true);
  const [selectedId, setSelectedId] = useState(visualizations[0].id);
  const options = useRef();
  options.current = { randomize, selectedId };
  const play = useCallback((detection, manual = false) => {
    previewing.current = manual;
    setPreview(manual);
    const next = options.current.randomize
      ? selectVisualization(visualizations, previous.current)
      : visualizations.find(item => item.id === options.current.selectedId);
    previous.current = next?.id;
    setVisualization(next);
    setPreviousBird(lastBird.current);
    lastBird.current = detection;
    setBird(detection);
    setSequence(value => value + 1);
  }, []);
  const finish = useCallback(() => {
    previewing.current = false;
    setPreview(false);
    setBird(null);
  }, []);

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
      setSeenBirds(current => mergeBirds(current, [detection]));
      if (!previewing.current) play(detection);
      else lastBird.current = detection;
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
  }, [version, play]);

  return (
    <main>
      <header>
        <div className="brand">
          <img src="/birdbrain.png" alt="BirdBrain mascot with a popped-open brain" width="64" height="64" />
          <h1>BirdBrain</h1>
        </div>
        <div className="header-controls">
          <div className="visualization-controls">
            <label htmlFor="visualization">Visualization</label>
            <select id="visualization" value={selectedId} disabled={randomize} onChange={event => setSelectedId(event.target.value)}>
              {visualizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <label htmlFor="randomize" className="checkbox-label"><input id="randomize" type="checkbox" checked={randomize} onChange={event => setRandomize(event.target.checked)} />Randomize</label>
          </div>
          <p className="connection"><i data-online={online} />{online ? 'Live' : 'Connecting'}</p>
        </div>
      </header>
      <div className="preview-controls">
        <label htmlFor="past-bird">Previously seen birds</label>
        <select id="past-bird" value={pastBird} disabled={!seenBirds.length} onChange={event => setPastBird(event.target.value)}>
          <option value="">Choose a bird…</option>
          {seenBirds.map(item => <option key={birdKey(item)} value={birdKey(item)}>{item.commonName}</option>)}
        </select>
        <button id="show-bird" type="button" disabled={!pastBird} onClick={() => play(seenBirds.find(item => birdKey(item) === pastBird), true)}>Show bird</button>
        {preview && <><span className="preview-status">Manual preview</span><button id="back-to-live" type="button" onClick={finish}>Back to live</button></>}
        {historyStatus === 'loading' && <span className="history-status">Loading bird history…</span>}
        {historyStatus === 'error' && <><span className="history-status">Could not load previously seen birds.</span><button id="retry-history" type="button" onClick={() => setHistoryAttempt(value => value + 1)}>Retry</button></>}
        {historyStatus === 'ready' && !seenBirds.length && <span className="history-status">No birds recorded yet.</span>}
      </div>
      <section aria-live="polite">
        {bird && visualization ? <Player key={sequence} visualization={visualization} bird={bird} previousBird={previousBird} onDone={finish} sound={sound} /> : <>
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

function birdKey(bird) { return bird.scientificName || bird.commonName; }
function mergeBirds(existing, incoming) {
  const birds = new Map(existing.map(bird => [birdKey(bird), bird]));
  for (const bird of incoming) birds.set(birdKey(bird), { ...birds.get(birdKey(bird)), ...bird });
  return [...birds.values()].sort((a, b) => a.commonName.localeCompare(b.commonName));
}
