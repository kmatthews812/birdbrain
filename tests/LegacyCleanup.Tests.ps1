$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../deploy/LegacyCleanup.ps1')
$root = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
$legacy = Join-Path $root ('data/releases/' + ('a' * 40))
$app = Join-Path $root 'app'
try {
    New-Item -ItemType Directory -Path $legacy -Force | Out-Null
    [IO.File]::WriteAllText((Join-Path $legacy '.env.local'), "OPENAI_API_KEY=keep-this-test-value`r`n")
    'example' | Set-Content (Join-Path $legacy '.env.example')
    Initialize-AppEnvironment $root
    if ([IO.File]::ReadAllText((Join-Path $app '.env.local')) -cne "OPENAI_API_KEY=keep-this-test-value`r`n") { throw 'Environment not preserved exactly' }
    [IO.File]::WriteAllText((Join-Path $app '.env.local'), 'different-test-value')
    try { Initialize-AppEnvironment $root; throw 'Conflicting environments accepted' }
    catch { if ($_.Exception.Message -notmatch 'different .env.local') { throw } }
    if ([IO.File]::ReadAllText((Join-Path $app '.env.local')) -cne 'different-test-value') { throw 'Existing environment overwritten' }
    Copy-Item (Join-Path $legacy '.env.local') (Join-Path $app '.env.local') -Force
    try { Remove-LegacyDeployment $root { throw 'not healthy' }; throw 'Unhealthy cleanup accepted' }
    catch { if ($_.Exception.Message -ne 'not healthy') { throw } }
    if (-not (Test-Path $legacy)) { throw 'Deleted releases before verification' }
    'keep' | Set-Content (Join-Path $legacy '.env.production')
    try { Remove-LegacyDeployment $root {}; throw 'Unmigrated environment deleted' }
    catch { if ($_.Exception.Message -notmatch 'unmigrated environment') { throw } }
    Remove-Item (Join-Path $legacy '.env.production') -Force
    New-Item -ItemType Directory -Path (Join-Path $root 'data/repository.git') -Force | Out-Null
    '{}' | Set-Content (Join-Path $root 'data/state.json')
    $script:verified = $false
    Remove-LegacyDeployment $root { $script:verified = $true }
    if (-not $script:verified -or (Test-Path (Join-Path $root 'data/releases')) -or (Test-Path (Join-Path $root 'data/repository.git')) -or (Test-Path (Join-Path $root 'data/state.json'))) { throw 'Legacy cleanup incomplete' }
    if ([IO.File]::ReadAllText((Join-Path $app '.env.local')) -cne "OPENAI_API_KEY=keep-this-test-value`r`n") { throw 'Cleanup changed app environment' }
    Remove-Item (Join-Path $app '.env.local') -Force
    Initialize-AppEnvironment $root
    if (-not (Test-Path (Join-Path $app '.env.local'))) { throw 'Missing local environment file' }
    Write-Host 'Legacy cleanup tests passed.'
} finally { Remove-Item -LiteralPath $root -Recurse -Force }
