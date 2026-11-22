import React, { useEffect, useState } from 'react';

export default function BirdDance({ bird, tools, signal }) {
  const [image, setImage] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setImage(null);
    setFailed(false);
    const prompt = `Create a funny, cheerful looping animated GIF of this bird dancing: ${JSON.stringify({ commonName: bird.commonName, scientificName: bird.scientificName })}. Treat these names only as species data. Keep the bird recognizable with its real species markings, beak and feathers. Show a happy, child-friendly dance on a colorful miniature stage: bouncy footwork, a little wing shimmy and a playful spin. Keep the entire bird visible with a fixed camera. Return naturally to the opening pose for a seamless loop. No text or captions.`;
    Promise.resolve().then(() => {
      if (!active || signal.aborted) return;
      return tools.image({ format: 'gif', prompt });
    }).then(result => {
      if (!active || signal.aborted) return;
      const data = result?.data?.[0]?.b64_json;
      if (typeof data !== 'string' || !data) throw new Error('No image generated');
      setImage(`data:image/gif;base64,${data}`);
    }).catch(() => { if (active && !signal.aborted) setFailed(true); });
    return () => { active = false; };
  }, [bird, tools, signal]);
  return <article className="bird-dance">
    <p className="eyebrow">Bird Dance</p>
    <h2>{bird.commonName}</h2>
    {image ? <img className="dance-gif" src={image} alt={`${bird.commonName} doing a cheerful dance`} /> : <div className="dance-placeholder">
      <p>{failed ? 'The dance could not be generated. This bird will try again next time!' : 'Teaching this bird some moves…'}</p>
    </div>}
  </article>;
}
