import React, { useEffect, useRef, useState } from 'react';

export default function DefaultView({ bird, signal, onReady }) {
  const [fact, setFact] = useState(null);
  const [factFailed, setFactFailed] = useState(false);
  const [credit, setCredit] = useState(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const notified = useRef(false);
  useEffect(() => {
    if (signal?.aborted || notified.current || !(fact || factFailed) || !(photoLoaded || photoFailed)) return;
    notified.current = true;
    onReady?.();
  }, [fact, factFailed, photoLoaded, photoFailed, onReady, signal]);
  useEffect(() => {
    const controller = new AbortController();
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    if (!bird.scientificName) { setFactFailed(true); setPhotoFailed(true); return () => controller.abort(); }
    Promise.resolve().then(() => {
      requestSignal.throwIfAborted();
      return fetch('/api/birds/fact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commonName: bird.commonName, scientificName: bird.scientificName }), signal: requestSignal,
      });
    }).then(response => {
      if (!response.ok) throw new Error('Fact unavailable');
      return response.json();
    }).then(data => { if (!requestSignal.aborted) setFact(data); })
      .catch(() => { if (!requestSignal.aborted) setFactFailed(true); });
    Promise.resolve().then(() => {
      requestSignal.throwIfAborted();
      return fetch(`/api/birds/photo?species=${encodeURIComponent(bird.scientificName)}`, { signal: requestSignal, cache: 'no-store' });
    }).then(response => {
      if (!response.ok) throw new Error('Attribution unavailable');
      return response.json();
    }).then(data => {
      if (!requestSignal.aborted) { setPhoto(data.url); setCredit(data); }
    }).catch(() => { if (!requestSignal.aborted) setPhotoFailed(true); });
    return () => controller.abort();
  }, [bird.commonName, bird.scientificName, signal]);
  return <article className="default-view">
    <figure>
      {photoFailed || !photo ? <div className="photo-placeholder">{photoFailed ? 'No photo available yet' : 'Finding a bird photo…'}</div> : <img className="bird-photo" src={photo} alt={bird.commonName} onLoad={() => { if (!signal?.aborted) setPhotoLoaded(true); }} onError={() => { if (!signal?.aborted) setPhotoFailed(true); }} />}
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
