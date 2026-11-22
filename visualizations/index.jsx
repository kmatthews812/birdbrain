import React from 'react';

function Rings({ bird }) {
  return <>
    <div className="rings" data-detected="true" aria-hidden="true" />
    <div className="caption">
      <h2>{bird.commonName}</h2>
      <p>{Math.round(bird.confidence * 100)}% confidence</p>
    </div>
  </>;
}

export const visualizations = [
  { id: 'rings', name: 'Birdsong rings', createdBy: 'BirdBrain', durationMs: 20000, Component: Rings },
];

export function selectVisualization(entries, previousId, random = Math.random) {
  const choices = entries.length > 1 ? entries.filter(entry => entry.id !== previousId) : entries;
  return choices[Math.floor(random() * choices.length)] || null;
}
