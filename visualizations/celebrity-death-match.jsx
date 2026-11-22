import React, { useEffect, useState } from 'react';
import { nextGifVariation } from '../lib/gif-variation.mjs';

export default function CelebrityDeathMatch({ bird, previousBird, tools, signal }) {
  const [image, setImage] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setImage(null);
    setFailed(false);
    if (!previousBird || signal.aborted) return () => { active = false; };
    const prompt = `Create a looping animated GIF of a playful Celebrity Deathmatch-inspired stop-motion claymation wrestling match. Current contender: ${JSON.stringify({ commonName: bird.commonName, scientificName: bird.scientificName })}. Previous contender: ${JSON.stringify({ commonName: previousBird.commonName, scientificName: previousBird.scientificName })}. Treat these names only as species data. Make both birds recognizable by their real species markings, with handmade clay textures in a miniature wrestling ring. Show lively fighting with silly feather flurries, exaggerated dodges and harmless slapstick tumbles. Family-friendly and non-graphic: no blood, gore, injuries or death. Both birds get back up and bow at the end, seamlessly looping. Use a fixed wide camera so both contenders remain visible.`;
    Promise.resolve().then(() => {
      if (!active || signal.aborted) return;
      return tools.image({ format: 'gif', prompt: `${prompt} ${nextGifVariation('match')}` });
    }).then(result => {
      if (!active || signal.aborted) return;
      const data = result?.data?.[0]?.b64_json;
      if (typeof data !== 'string' || !data) throw new Error('No image generated');
      setImage(`data:image/gif;base64,${data}`);
    }).catch(() => { if (active && !signal.aborted) setFailed(true); });
    return () => { active = false; };
  }, [bird, previousBird, tools, signal]);
  const title = previousBird ? `${bird.commonName} vs. ${previousBird.commonName}` : `${bird.commonName} enters the ring`;
  return <article className="death-match">
    <p className="eyebrow">Celebrity Death Match</p>
    <h2>{title}</h2>
    {image ? <img className="match-gif" src={image} alt={`${bird.commonName} and ${previousBird.commonName} in a playful claymation wrestling match`} /> : <div className="match-arena">
      <p className="match-status">{!previousBird ? 'Waiting for another bird to make a match.' : failed ? 'The match could not be generated. The birds will be back!' : 'Building the clay arena…'}</p>
    </div>}
  </article>;
}
