import React, { useEffect, useState } from 'react';

export default function NextBird({ startedAt }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [startedAt]);
  const seconds = Math.max(0, Math.ceil((startedAt + 30000 - now) / 1000));
  return <p className="next-bird">Next bird in {seconds} {seconds === 1 ? 'second' : 'seconds'}</p>;
}
