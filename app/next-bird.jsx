import React, { useEffect, useState } from 'react';

export default function NextBird({ startedAt, pending }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [startedAt]);
  const seconds = Math.max(0, Math.ceil((startedAt + 30000 - now) / 1000));
  return <p className="next-bird">{seconds > 0 ? `${seconds} ${seconds === 1 ? 'second' : 'seconds'} remaining` : pending ? 'Waiting for the next bird to finish…' : 'Waiting for the next bird…'}</p>;
}
