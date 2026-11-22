$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../deploy/CheckoutDeployment.ps1')
$root = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
$remote = Join-Path $root 'remote'
$app = Join-Path $root 'app'
$git = (Get-Command git).Source
function Git-Test([string[]]$Arguments) {
    & $git @Arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Test git command failed' }
}
$script:events = @()
$script:running = $true
$script:failBuild = $false
$stop = { $script:events += 'stop'; $script:running = $false }
$start = { param($commit) $script:events += "start:$commit"; $script:running = $true }
$build = {
    param($path)
    if ($script:running) { throw 'Built while the server was running' }
    if ($path -ne $app) { throw 'Build changed app directory' }
    $script:events += 'build'
    if ($script:failBuild) { throw 'Build failed' }
    New-Item -ItemType Directory -Path (Join-Path $path '.next') -Force | Out-Null
}
try {
    New-Item -ItemType Directory -Path $remote -Force | Out-Null
    Git-Test @('init', '-b', 'main', $remote)
    Git-Test @('-C', $remote, 'config', 'user.email', 'test@example.test')
    Git-Test @('-C', $remote, 'config', 'user.name', 'Test')
    ".env*`n.next/" | Set-Content (Join-Path $remote '.gitignore')
    'one' | Set-Content (Join-Path $remote 'app.txt')
    Git-Test @('-C', $remote, 'add', '.')
    Git-Test @('-C', $remote, 'commit', '-m', 'first')
    $first = (& $git -C $remote rev-parse HEAD).Trim()
    Invoke-CheckoutDeployment $app $git $remote 'main' $stop $build $start
    if (($script:events -join ',') -ne "stop,build,start:$first") { throw 'Initial deployment lifecycle incorrect' }
    $envFile = Join-Path $app '.env.local'
    [IO.File]::WriteAllText($envFile, "OPENAI_API_KEY=test-secret`n")
    $envBytes = [IO.File]::ReadAllBytes($envFile)
    'two' | Set-Content (Join-Path $remote 'app.txt')
    Git-Test @('-C', $remote, 'commit', '-am', 'second')
    $second = (& $git -C $remote rev-parse HEAD).Trim()
    $script:events = @()
    Invoke-CheckoutDeployment $app $git $remote 'main' $stop $build $start
    if (($script:events -join ',') -ne "stop,build,start:$second") { throw 'Update lifecycle incorrect' }
    if ((Get-Content (Join-Path $app 'app.txt')).Trim() -ne 'two') { throw 'Checkout not updated' }
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes($envFile)) -ne [Convert]::ToBase64String($envBytes)) { throw 'Environment file modified' }
    & $git -C $app check-ignore -q .env.local
    if ($LASTEXITCODE -ne 0) { throw 'Environment file not ignored' }
    $script:events = @()
    Invoke-CheckoutDeployment $app $git $remote 'main' $stop $build $start
    if (($script:events -join ',') -ne "start:$second") { throw 'Unchanged commit rebuilt or stopped' }
    'three' | Set-Content (Join-Path $remote 'app.txt')
    Git-Test @('-C', $remote, 'commit', '-am', 'third')
    $third = (& $git -C $remote rev-parse HEAD).Trim()
    $script:events = @(); $script:failBuild = $true
    try { Invoke-CheckoutDeployment $app $git $remote 'main' $stop $build $start; throw 'Failed build accepted' }
    catch { if ($_.Exception.Message -ne 'Build failed') { throw } }
    if ($script:running -or ($script:events -join ',') -ne 'stop,build') { throw 'Failed build started a server' }
    if (Test-Path (Join-Path $app '.next/BIRD_APP_VERSION')) { throw 'Failed build left a launchable marker' }
    $script:failBuild = $false; $script:events = @()
    Invoke-CheckoutDeployment $app $git $remote 'main' $stop $build $start
    if (($script:events -join ',') -ne "stop,build,start:$third") { throw 'Failed build not retried' }
    'user edit' | Set-Content (Join-Path $app 'app.txt')
    $script:events = @()
    try { Invoke-CheckoutDeployment $app $git $remote 'main' $stop $build $start; throw 'Dirty checkout accepted' }
    catch { if ($_.Exception.Message -notmatch 'local changes') { throw } }
    if ($script:events.Count -ne 0 -or (Get-Content (Join-Path $app 'app.txt')).Trim() -ne 'user edit') { throw 'User edits were touched' }
    Write-Host 'Checkout deployment tests passed.'
} finally { if (Test-Path $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
