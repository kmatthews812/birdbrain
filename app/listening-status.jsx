import React, { useEffect, useState } from 'react';

export default function ListeningStatus({ timestamp, loading = false, error = false }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  let message;
  if (timestamp && Number.isFinite(Date.parse(timestamp))) {
    const seconds = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 1000));
    const unit = seconds < 60 ? 'second' : seconds < 3600 ? 'minute' : 'hour';
    const amount = Math.floor(seconds / (unit === 'hour' ? 3600 : unit === 'minute' ? 60 : 1));
    message = `Last bird sighting was ${amount} ${unit}${amount === 1 ? '' : 's'} ago`;
  } else if (timestamp || error) message = 'Last sighting time is unavailable.';
  else if (loading) message = 'Checking the last sighting…';
  else message = 'No bird sightings yet.';
  return <div className="caption"><h2>Listening…</h2><p>{message}</p></div>;
}
