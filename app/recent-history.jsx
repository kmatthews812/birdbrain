import React, { useEffect, useState } from 'react';

export default function RecentHistory({ detection, activeBird, onSelect, onHistory }) {
  const [birds, setBirds] = useState([]);
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetch('/api/birds/recent', { signal: controller.signal, cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Recent sightings unavailable');
      const data = await response.json();
      if (!Array.isArray(data.birds)) throw new Error('Invalid sightings');
      if (controller.signal.aborted) return;
      setBirds(current => mergeRecent(data.birds, current));
      setStatus('ready');
    }).catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => { if (detection) setBirds(current => mergeRecent(current, [detection])); }, [detection]);
  useEffect(() => { onHistory?.({ status, latest: birds[0] }); }, [birds, status, onHistory]);
  return <aside className="recent-history" aria-labelledby="recent-title">
    <div className="recent-heading"><h2 id="recent-title">Recent sightings</h2><p>Tap a bird to play</p></div>
    {status === 'loading' && <p className="recent-status">Loading recent sightings…</p>}
    {status === 'error' && <><p className="recent-status">Could not load recent sightings.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry recent sightings</button></>}
    {status === 'ready' && !birds.length && <p className="recent-status">No recent sightings yet.</p>}
    <ol>{birds.map(bird => <li key={key(bird)}><button type="button" aria-current={activeBird && key(activeBird) === key(bird) ? "true" : undefined} onClick={() => onSelect(bird)}>
      <span className="recent-name">{bird.commonName}</span>
      <time dateTime={bird.timestamp}>{formatTime(bird.timestamp)}</time>
    </button></li>)}</ol>
  </aside>;
}
function key(bird) { return bird.id != null ? String(bird.id) : `${bird.scientificName || bird.commonName}:${bird.timestamp || `${bird.date}T${bird.time}`}`; }
function mergeRecent(existing, incoming) {
  const birds = new Map(existing.map(bird => [key(bird), bird]));
  for (const bird of incoming) birds.set(key(bird), bird);
  return [...birds.values()].sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)).slice(0, 30);
}
function formatTime(timestamp) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(new Date(timestamp));
}
