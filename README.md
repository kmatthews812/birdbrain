# BirdBrain

BirdBrain displays live BirdNET-Go detections on an iPad. Its Next.js server relays
the BirdNET-Go detection stream over SSE and uses the active Git commit as the
version. The display checks for a new version every 10 seconds while open and
again when Safari becomes visible.

## Windows host

1. Install Git for Windows and the x64 Node.js 24 or 26 LTS MSI system-wide. The installer
   defaults to `C:\Program Files\Git\cmd\git.exe` and
   `C:\Program Files\nodejs\node.exe`.
2. Push the app and lockfile to [birdbrain/main](https://github.com/kmatthews812/birdbrain/tree/main).
   The Windows deployer fetches this repository anonymously.
3. In an administrator PowerShell on the BirdNET-Go PC, from this checkout run:

   ```powershell
   Set-Location (Join-Path $env:USERPROFILE 'Code\birdbrain')
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\Install-Host.ps1
   ```

   The installer downloads and checks the pinned WinSW executable, creates the
   automatic BirdBrain service and private-LAN port 3000 rule, then registers
   BirdBrain Deploy. Enter your Windows password in the local credential prompt.
   The task runs as that Windows account at limited privileges, including while
   signed out. The application service runs as LocalService.

4. Once the first build completes, check `http://127.0.0.1:3000/api/version` on
   Windows and open `http://192.168.4.34:3000` in Safari on your home Wi-Fi.
   If it works locally but Safari cannot connect, check that Windows classifies
   the home Wi-Fi as Private. The rule is scoped to the Private profile and the
   local subnet.

## Deployments

Push changes to `main` to deploy. The scheduled task fetches once a minute when
idle. It runs `npm ci`, `npm test` and `npm run build` in a commit-specific
release directory. During the switch the service briefly restarts, and
`/api/version` must return the expected commit. Failed builds leave the service
running. A failed health check restores the previous release. The task also
recovers an interrupted switch before staging another release.

- Task Scheduler Library → **BirdBrain Deploy**
- Services → **BirdBrain**
- Deploy logs in `C:\ProgramData\BirdBrain\data\deploy-YYYY-MM-DD.log`
- WinSW logs in `C:\ProgramData\BirdBrain\service-logs`

Changes to the Windows host scripts take effect when the administrator reruns
the installer. The deployed branch controls the app, and the Windows task runs
the installed copy of the host script.

## Development checks

```powershell
npm ci
npm test
npm run build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\ReleaseState.Tests.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\ReleaseActivation.Tests.ps1
```
