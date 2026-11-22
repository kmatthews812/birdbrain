'use client';

import React, { useEffect, useState } from 'react';
import { createTools } from '../lib/visualization-tools.mjs';

export default function Player({ visualization, bird, onDone, sound }) {
  const [session, setSession] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setSession({ cancel: () => controller.abort(), signal: controller.signal, tools: createTools({ signal: controller.signal, sound }) });
    const timer = setTimeout(onDone, visualization.durationMs);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [visualization, onDone, sound]);
  const Component = visualization.Component;
  return <>
    {session && <VisualizationBoundary bird={bird} onError={session.cancel}><Component bird={bird} tools={session.tools} signal={session.signal} /></VisualizationBoundary>}
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
