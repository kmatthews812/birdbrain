# BirdBrain

BirdBrain displays live BirdNET-Go detections on an iPad. The Windows host runs
one Next.js development server so source changes hot-reload after Git updates.

## Windows layout

- `C:\ProgramData\BirdBrain\app`: the one persistent Git checkout
- `C:\ProgramData\BirdBrain\app\.env.local`: server-only configuration, ignored by Git
- `C:\ProgramData\BirdBrain\logs`: scheduled-update logs and deployment lock
- Windows service **BirdBrain**: owns the single `next dev` server on port 3000
- Scheduled task **BirdBrain Deploy**: fetches `main` once per minute and fast-forwards the same checkout

Ordinary source changes keep the server running and hot-reload. Changes to
`package.json` or `package-lock.json` stop the service, run `npm ci`, then restart
it once. Updates run Node and deployment tests; failed checks stop the service
until a subsequent successful attempt. There are no release directories or
automatic rollback copies. Local tracked edits or divergent history stop updates
rather than being overwritten. `.env.local` is never reset, cleaned, or committed.

Next dev uses a CLI process and a listening worker beneath the service launcher;
these are one server, not separate deployments. The health check verifies one
listener on port 3000 belonging to that service tree. Unrelated processes are
never killed. Keep the development server on the trusted home LAN; the firewall
rule is limited to the Windows Private network profile and local subnet.

## Migrate the existing Windows host

From an updated checkout, run this once in **Administrator PowerShell**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\Migrate-Host.ps1
```

This pauses the existing deploy task, preserves an existing `.env.local`, installs
the new deploy scripts, starts the fixed checkout, and verifies its service tree.
Only after the health check succeeds does it delete the old `data` directory
(release copies, bare repository, state, and old deploy logs). The deploy task is
then re-enabled. Conflicting environment files stop migration without overwriting
them. If no `.env.local` exists, migration creates a comment-only placeholder.
A failed migration retains the old release data and can be retried; the app may
remain stopped until the problem is fixed. It does not restore the previous app.

## Fresh Windows installation

Install machine-wide Git for Windows and Node.js 24 or 26 LTS. From this checkout,
run `deploy\Install-Host.ps1` in Administrator PowerShell and enter your Windows
password in the local credential prompt. The installer creates the service and
minute-by-minute task. Use the migration script for an existing release-based host.
Host-script changes require explicitly rerunning migration; ordinary app commits
hot-reload from the installed scheduled task.

Open [BirdBrain](http://192.168.4.34:3000) in Safari on the iPad. Tap **Enable sound**
after opening or reloading. The version endpoint is `/api/version`; it reads the
accepted checkout version without needing a server restart.

## Configuration

Edit `C:\ProgramData\BirdBrain\app\.env.local` on Windows:

```dotenv
OPENAI_API_KEY=your-key
```

Next dev reloads environment changes. Keep the key server-only: never prefix it
with `NEXT_PUBLIC_`. Windows connects to BirdNET-Go at `http://127.0.0.1:8080`.
For local development on the Mac, copy `.env.example` to `.env.local` to use the
Windows BirdNET-Go server, then run `npm run dev`.

## Visualization framework

Each new detection plays a registered React visualization with the complete bird
payload, its name, and creator credit. **Default View**, by Kevin, shows a bird
photo and sourced fun fact. **Randomize** is on by default; uncheck it to select a
visualization. The previously seen birds selector and **Show bird** let you preview
any recorded species, then **Back to live** resumes listening. The **Recent sightings**
sidebar lists the latest 30 individual detections, with exact dates and times in
the viewing device’s time zone. Click a sighting to play it with the current
visualization selection; new detections appear live. Tools support
BirdNET JSON REST queries, OpenAI text, web search, PNG/GIF generation, and sound.
See [the author guide](docs/visualizations.md) for the component contract and examples.

## Checks

```powershell
npm ci
npm test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\Run-DeploymentTests.ps1
npm run build
```

The production build remains a compatibility check; the Windows display runs
`next dev` and does not rebuild for each pull.
