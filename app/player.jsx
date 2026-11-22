'use client';

import React, { useEffect, useState } from 'react';
import { createTools } from '../lib/visualization-tools.mjs';

export default function Player({ visualization, bird, onDone }) {
  const [session, setSession] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setSession({ signal: controller.signal, tools: createTools({ signal: controller.signal }) });
    const timer = setTimeout(onDone, visualization.durationMs);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [visualization, onDone]);
  const Component = visualization.Component;
  return <>
    {session && <Component bird={bird} tools={session.tools} signal={session.signal} />}
    <p className="credit">{visualization.name} · Created by {visualization.createdBy}</p>
  </>;
}
