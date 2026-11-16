export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const base = process.env.BIRDNET_BASE_URL || 'http://127.0.0.1:8080';
    const headers = { Accept: 'text/event-stream' };
    const token = process.env.BIRDNET_TOKEN;
    if (token) headers.Authorization = 'Bearer ' + token;

    const response = await fetch(new URL('/api/v2/detections/stream', base), {
      headers, cache: 'no-store', signal: request.signal, redirect: 'error',
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
      await response.body?.cancel();
      return unavailable();
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch {
    return unavailable();
  }
}

function unavailable() {
  // Keep a valid SSE response so EventSource retries after an upstream outage.
  return new Response('retry: 5000\n\n', {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
  });
}
