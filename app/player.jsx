'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createTools } from '../lib/visualization-tools.mjs';

export default function Player({ visualization, bird, previousBird, sound, active = true, onReady }) {
  const isActive = useRef(active);
  isActive.current = active;
  const [session, setSession] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setSession({ cancel: () => controller.abort(), signal: controller.signal, tools: createTools({ signal: controller.signal, sound: { play: (url, signal) => isActive.current && sound ? sound.play(url, signal) : Promise.resolve(false) } }) });
    const cancel = () => controller.abort();
    window.addEventListener('pagehide', cancel);
    return () => { window.removeEventListener('pagehide', cancel); cancel(); };
  }, [visualization, sound]);
  const Component = visualization.Component;
  return <>
    {session && <VisualizationBoundary bird={bird} onError={() => { session.cancel(); onReady?.(); }}><Component onReady={onReady} active={active} bird={bird} previousBird={previousBird} tools={session.tools} signal={session.signal} /></VisualizationBoundary>}
    <p className="credit">{visualization.name} · Created by {visualization.createdBy}</p>
  </>;
}

class VisualizationBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() {
    if (this.state.failed) return <div className="caption">
      <h2>{this.props.bird.commonName}</h2>
      <p role="status">This visualization needs a little help. Listening for the next bird.</p>
    </div>;
    return this.props.children;
  }
}
