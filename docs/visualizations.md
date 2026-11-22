# Creating a BirdBrain visualization

A visualization is a React component plus a registry entry. The framework selects
one at random for each new BirdNET-Go detection, avoiding the previous choice
when more than one is registered. It passes the entire validated detection as
`bird`, the preceding bird as `previousBird` (or `null` for the first bird), a
`tools` object, and an `AbortSignal` named `signal`. **Default View**,
created by Kevin, shows a rotating species photo and a sourced fun fact. Family creations
can be added independently.

**Celebrity Death Match**, also by Kevin, generates a playful claymation fight GIF
with OpenAI using the current and preceding birds. It waits for an opponent on
the first detection. To stage a manual matchup, preview one bird, select Celebrity
Death Match with Randomize unchecked, then preview the second bird. Live events
received during previews still update the preceding bird for the next matchup.
The matchup remains visible until another detection or manual selection replaces it. Each matchup generates a new GIF and incurs an image API charge.

The upper-right selector chooses a specific visualization when **Randomize** is
unchecked. Randomize is checked by default. Choose a previously seen species and
press **Show bird** to preview it. Manual previews remain visible until the next live
detection or another manual selection. **Back to live** clears a manual preview.

Create a component under `visualizations/`, import it in `visualizations/index.jsx`,
and add an entry to `visualizations`:

```jsx
{ id: 'bird-party', name: 'Bird Party', createdBy: 'Your name',
  Component: BirdParty }
```

IDs must be unique lowercase kebab-case and names and credits nonempty. The registry test checks these rules.
The component can render any React markup, SVG, canvas, images, or CSS animation
inside the main stage. Scope your CSS to your component so other creations keep
their styles. Honor `prefers-reduced-motion` where possible.

```jsx
import React from 'react';

export default function BirdParty({ bird }) {
  return <div className="bird-party">
    <h2>{bird.commonName}</h2>
    <p>Welcome to the party!</p>
  </div>;
}
```

`bird` always has `commonName`. Live detections have `confidence` (0–1); historical
species previews do not. BirdNET-Go may also supply
`id`, `scientificName`, `speciesCode`, `timestamp`, `source`, `clipName`, `birdImage`,
and other fields. Treat those as optional. The framework displays the creation's
name and author below the stage.

## Tools

All tools are promises. HTTP requests go through the Next.js server, so the iPad
never receives API keys. `birdnet` uses the server's configured host and permits
JSON GET requests under `/api/v2/`; it does not change BirdNET settings.

```js
const recent = await tools.birdnet({ path: '/api/v2/detections/recent' });
const detections = await tools.birdnet({
  path: '/api/v2/detections', params: { species: bird.scientificName, limit: 10 },
});
const text = await tools.generate({ prompt: `Write a short joke about ${bird.commonName}.` });
const facts = await tools.search({ prompt: `Find a fun fact about ${bird.commonName}, with sources.` });
const gif = await tools.image({ prompt: `A dancing ${bird.commonName}`, format: 'gif' });
await tools.playSound('/sounds/chirp.wav');
```

The second REST example illustrates parameter forwarding; check your installed
BirdNET-Go API for supported filters. REST paths contain letters, digits, slashes,
underscores, and hyphens; put search text in `params` for URL encoding. Media/binary
responses are not supported by this JSON tool.

`generate` and `search` return the raw OpenAI Responses JSON. Extract text from
`result.output` message items' `content` entries with `type === 'output_text'`;
`text` contains the text and `annotations` contains source citations. Render
search citations as visible links. Do not assume the first output item is a message.
`image` returns raw Images JSON: `result.data[0].b64_json` can be displayed as
`data:image/gif;base64,...` (or `image/png` for the default PNG format).

The API supports [web search](https://developers.openai.com/api/docs/guides/tools-web-search)
and [animated GIF output](https://developers.openai.com/api/docs/guides/image-generation#generate-animated-gif-output).
Model access depends on the configured OpenAI account. Calls incur API charges;
Default View makes a fresh web-search request for each playback, including repeat
sightings of the same species. Facts and generated GIFs are not cached or shared
between playbacks. OpenAI may still return a similar fact on a new request. Photos
are selected from licensed iNaturalist species photos, avoiding the previous image
when alternatives exist. Candidate lists refresh hourly; each playback selects
again. Photo credits travel with the selected image. BirdNET-Go’s cached image
is the fallback when alternatives cannot be loaded. There is no spending quota; other
visualizations should cache expensive repeated generation.

Put sound assets in `public/sounds/`. Tap **Enable sound** once after opening or
reloading the page. `playSound` returns `false` when muted and `true` when playback
starts, and rejects if loading fails. External audio URLs need to allow CORS.
The same audio context is reused after that tap; muting stops active sounds.

## Lifetimes and errors

In live mode, each new detection immediately replaces the previous visualization. Repeated IDs
within the last 100 detections are ignored. Visualizations have no automatic expiry.
Before the first playback, the stage shows “Listening…” and the elapsed time since
the latest real sighting, updated every second. Historical previews do not change
that timestamp. Events received while the page is disconnected or asleep
are not replayed; this is a live display, not a durable event log.

Replacement, clearing the preview, and render errors abort tool requests and stop sounds. Your
component must still clean up its own timers, animation frames, listeners, and
other resources in effect cleanup functions. Catch async errors inside the
component; React error boundaries handle render/lifecycle failures, not arbitrary
rejected promises or event handlers.

```jsx
useEffect(() => {
  tools.generate({ prompt: `A short greeting for ${bird.commonName}` })
    .then(result => { if (!signal.aborted) setResult(result); })
    .catch(error => { if (!signal.aborted) setError(error.message); });
}, [bird, tools, signal]);
```

BirdNET tool requests time out after 15 seconds; OpenAI requests after 120 seconds,
or sooner when the visualization is replaced. For expensive generation,
show a useful placeholder immediately. New detections can still
interrupt it. Aborting a request does not guarantee cancellation of provider charges.
Never execute generated code or inject untrusted HTML into the page. Components
added to this repository are trusted application code, not sandboxed plugins.

## Configuration and testing

Copy `.env.example` to `.env.local` on the Mac, add `OPENAI_API_KEY` locally when
ready, and restart Next.js. `.env.local` is ignored by Git. Model defaults can be
overridden with `OPENAI_MODEL` and `OPENAI_IMAGE_MODEL`.

On Windows, put these in `C:\ProgramData\BirdBrain\app\.env.local`. The single
checkout retains this Git-ignored file across pulls, and Next dev reloads environment
changes. The installed service sets `BIRDNET_BASE_URL=http://127.0.0.1:8080`.
Never commit secrets. No system environment variable or Windows reboot is needed.

Until a key is configured, AI tools report “Set OPENAI_API_KEY on the BirdBrain
server to enable this tool.” BirdNET events, REST queries, local visuals, and sound
work independently. The tool endpoint accepts same-origin browser POSTs only;
keep this app on the trusted home LAN. It has no account login or per-user quota.

Run `npm test` and `npm run build` with a supported Node version before committing.
Add focused behavior tests for each creation. Test Safari on the actual iPad,
including sound after a fresh page load, portrait/landscape layouts, and reconnects
after sleep. For an always-on display, use power and disable Auto-Lock in iPad settings.
