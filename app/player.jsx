'use client';

import React, { useEffect, useState } from 'react';
import { createTools } from '../lib/visualization-tools.mjs';

export default function Player({ visualization, bird, onDone, sound }) {
  const [session, setSession] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setSession({ signal: controller.signal, tools: createTools({ signal: controller.signal, sound }) });
    const timer = setTimeout(onDone, visualization.durationMs);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [visualization, onDone, sound]);
  const Component = visualization.Component;
  return <>
    {session && <Component bird={bird} tools={session.tools} signal={session.signal} />}
    <p className="credit">{visualization.name} · Created by {visualization.createdBy}</p>
  </>;
}
