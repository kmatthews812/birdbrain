export function readDetection(payload) {
  try {
    const bird = JSON.parse(payload);
    const commonName = bird?.commonName?.trim();
    const confidence = bird?.confidence;
    if (!commonName || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return null;
    return { commonName, confidence };
  } catch {
    return null;
  }
}

export function shouldReload(displayedVersion, runningVersion) {
  return Boolean(displayedVersion && runningVersion && displayedVersion !== runningVersion);
}
