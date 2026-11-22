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
Death Match with Randomize unchecked, then preview the second bird. Each queued matchup uses the bird immediately before it in queue order.
The matchup remains visible until another detection or manual selection replaces it. Each matchup generates a new GIF and incurs an image API charge.

**Bird Dance**, by Kevin, generates a fresh looping GIF of the current species
doing a cheerful dance. It needs no previous bird and remains visible until
another detection or manual selection replaces it. Both GIF visualizations vary
their stage, choreography, props and colors on each generation, avoiding the
immediately previous scene. Bird Dance rotates through 32 named routines with
signature movement instructions: Twerking, Running Man, Macarena, Meatstick,
Griddy, Pole dance, Moonwalk, Robot, Carlton, Floss, Gangnam Style, Chicken Dance,
YMCA, Disco Point, Hammer Shuffle, Cabbage Patch, Sprinkler, Lawnmower, Shopping
Cart, Worm, Mashed Potato, Twist, Charleston, Hokey Pokey, Bunny Hop, Electric
Slide, Cha Cha Slide, Cotton Eye Joe, Dougie, Crank That, Dab, and Vogue.
Moves are adapted to wings and bird anatomy, with full-body framing and playful,
non-explicit choreography. The pole routine uses a visible pole with spins and
acrobatics. Cached manual replays retain their existing dance; new generations
draw from the expanded rotation.

Reference examples: [Justin Jefferson demonstrating the Griddy](https://www.youtube.com/watch?v=TrxR5HMtr-M),
[Macarena movement guide](https://www.macarena.com/macarena-dance-moves), and
[Phish Meatstick dance background](https://phish.net/faq/meatstick-dance).

The upper-right selector chooses a specific visualization when **Randomize** is
unchecked. Randomize is checked by default. Choose a previously seen species and
press **Show bird** or click a recent sighting to enter manual mode immediately.
Manual browsing has no minimum duration: clicks show the cached view right away,
including a view still being built. An uncached choice appears loading and finishes
in place. With Randomize enabled, an existing view for that sighting is reused;
with a specific visualization selected, its matching cached view is reused.
Live arrivals update history without interrupting manual browsing or starting new
generation. **Back to live** resumes listening for the next detection.
The browser retains up to 30 completed views, plus active preparation and queued
views. Leaving or hiding the page clears this cache and cancels preparation.

Create a component under `visualizations/`, import it in `visualizations/index.jsx`,
and add an entry to `visualizations`:

```jsx
{ id: 'bird-party', name: 'Bird Party', createdBy: 'Your name',
  Component: BirdParty }
```

IDs must be unique lowercase kebab-case and names and credits nonempty. The registry test checks these rules.
The component can render any React markup, SVG, canvas, images, or CSS animation
inside the main stage. Components receive an `active` boolean: false while preparing
in the queue, true while displayed. Start visual timers and interactive audio
when active; tool-based sound is suppressed during preparation. Data-loading
effects should keep their results when active changes. Call the supplied
`onReady()` after content and images have loaded, or after rendering a finished
error fallback. Do not call it while a loading placeholder is still shown or
after cancellation. The queue waits for this callback before displaying the view. Scope your CSS to your component so other creations keep
their styles. Honor `prefers-reduced-motion` where possible.

```jsx
import React, { useEffect } from 'react';

export default function BirdParty({ bird, onReady }) {
  useEffect(() => { onReady(); }, [onReady]);
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
sightings of the same species. New live sightings generate fresh facts and GIFs. Manual clicks reuse their
existing view while it remains in the browser cache. The server remembers 20 recent facts per species, asks for
different information rather than paraphrases, and retries an exact normalized
repeat once before reporting it unavailable. Semantic novelty is not guaranteed,
and this memory resets when the server restarts. Photos use every available
licensed iNaturalist candidate before repeating, retaining that rotation across
hourly candidate refreshes. A finite photo pool will eventually cycle. Photo credits travel with the selected image. BirdNET-Go’s cached image
is the fallback when alternatives cannot be loaded. There is no spending quota; other
visualizations should cache expensive repeated generation.

Put sound assets in `public/sounds/`. Tap **Enable sound** in the header once after
opening or reloading the page (required by browser autoplay rules). Every new live
detection then plays a six-second kookaburra laugh, including repeated species. Replayed event
IDs and manual previews do not alert. **Mute sound** stops and disables both alerts
and visualization audio; **Unmute sound** enables them again. `playSound` returns `false` when muted and `true` when playback
starts, and rejects if loading fails. External audio URLs need to allow CORS.
The same audio context is reused after that tap; muting stops active sounds.

## Viewer activity

OpenAI and photo-provider requests start only for the active or queued views
of a visible browser.
There are no background generation jobs. Hidden tabs and page departure close the
BirdNET event stream, stop polling and sounds, and abort pending visualization
requests. Returning to the page resumes listening without generating content for
missed events. Closing every viewer leaves no visualization requests running;
provider work already accepted may not stop immediately on cancellation.

The Windows task still checks GitHub every minute for updates, even with no viewers.

## Lifetimes and errors

In live mode, the first bird appears immediately while loading. Its completed
view starts a 30-second minimum display period. Further detections prepare in
arrival order behind the displayed bird. Every completed live view shows its
remaining minimum display time, even when nothing else is queued. Manual browsing
bypasses this queue and countdown.
The recent-sightings sidebar highlights the currently displayed sighting, not
the newest arrival. A small spinner marks sightings whose views are preparing.
When that period ends and the next bird is ready, it starts its own full
30-second period. If it is still preparing, the current view stays visible.
If nothing is waiting, the current view stays until another bird arrives. Facts
and GIFs begin loading as soon as a bird is queued, using the selector settings
at that time. Each queued component stays mounted but hidden, then is revealed
without restarting its requests. Image loading and generation time do not count
toward the 30 seconds. The first bird’s loading state is visible; later queued
birds remain hidden until their turn unless clicked manually. Repeated species still get fresh playback; repeated event IDs
within the last 100 detections are ignored. Leaving or hiding the page clears the
queue, so no queued generation runs without a viewer.
Before the first playback, the stage shows “Listening…” and the elapsed time since
the latest real sighting, updated every second. Historical previews do not change
that timestamp. Events received while the page is disconnected or asleep
are not replayed; this is a live display, not a durable event log.

Hiding a cached view stops its sounds while preserving its results and ongoing
preparation. Eviction, page departure, and render errors abort tool requests. Your
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
