import React, { useEffect, useState } from 'react';

export default function DefaultView({ bird, signal }) {
  const [fact, setFact] = useState(null);
  const [factFailed, setFactFailed] = useState(false);
  const [credit, setCredit] = useState(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const photo = `/api/birds/image?species=${encodeURIComponent(bird.scientificName || '')}`;
  useEffect(() => {
    const controller = new AbortController();
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    if (!bird.scientificName) { setFactFailed(true); setPhotoFailed(true); return () => controller.abort(); }
    fetch('/api/birds/fact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commonName: bird.commonName, scientificName: bird.scientificName }), signal: requestSignal,
    }).then(response => {
      if (!response.ok) throw new Error('Fact unavailable');
      return response.json();
    }).then(data => { if (!requestSignal.aborted) setFact(data); })
      .catch(() => { if (!requestSignal.aborted) setFactFailed(true); });
    fetch(`${photo}&info=1`, { signal: requestSignal }).then(response => {
      if (!response.ok) throw new Error('Attribution unavailable');
      return response.json();
    }).then(data => { if (!requestSignal.aborted) setCredit(data); }).catch(() => {});
    return () => controller.abort();
  }, [bird.commonName, bird.scientificName, photo, signal]);
  return <article className="default-view">
    <figure>
      {photoFailed ? <div className="photo-placeholder">No photo available yet</div> : <img className="bird-photo" src={photo} alt={bird.commonName} onError={() => setPhotoFailed(true)} />}
      {credit && <figcaption>
        {credit.authorName && <>Photo: {credit.authorURL ? <a href={credit.authorURL} target="_blank" rel="noreferrer">{credit.authorName}</a> : credit.authorName}</>}
        {credit.licenseName && <> · {credit.licenseURL ? <a href={credit.licenseURL} target="_blank" rel="noreferrer">{credit.licenseName}</a> : credit.licenseName}</>}
      </figcaption>}
    </figure>
    <div className="bird-story">
      <p className="eyebrow">Look who’s here</p>
      <h2>{bird.commonName}</h2>
      <p className="scientific-name">{bird.scientificName}</p>
      <p className="fun-fact">{factFailed ? 'A fun fact is unavailable right now. Keep listening!' : fact?.fact || 'Finding a fun fact…'}</p>
      {fact?.sources?.length > 0 && <p className="fact-sources">Learn more: {fact.sources.map((source, index) => <React.Fragment key={source.url}>{index > 0 && ' · '}<a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></React.Fragment>)}</p>}
      {Number.isFinite(bird.confidence) && <p className="confidence">{Math.round(bird.confidence * 100)}% confidence</p>}
    </div>
  </article>;
}
