#Requires -RunAsAdministrator
[CmdletBinding()]
param([string]$Root = 'C:\ProgramData\BirdBrain')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Service.ps1')
. (Join-Path $PSScriptRoot 'LegacyCleanup.ps1')
if (-not (Test-Path -LiteralPath (Join-Path $Root 'host.json'))) { throw 'BirdBrain is not installed. Run Install-Host.ps1 first.' }
$task = Get-ScheduledTask -TaskName 'BirdBrain Deploy'
$wasEnabled = $task.Settings.Enabled
Disable-ScheduledTask -TaskName 'BirdBrain Deploy' | Out-Null
$lock = $null
try {
    $until = (Get-Date).AddMinutes(2)
    while ((Get-ScheduledTask -TaskName 'BirdBrain Deploy').State -eq 'Running') {
        if ((Get-Date) -ge $until) { throw 'A deployment is still running. Retry migration after it finishes.' }
        Start-Sleep -Seconds 2
    }
    $lock = [IO.File]::Open((Join-Path $Root 'data/deploy.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    Initialize-AppEnvironment $Root
    Stop-BirdBrain $Root
    foreach ($name in @('Deploy.ps1', 'CheckoutDeployment.ps1', 'Service.ps1', 'LegacyCleanup.ps1', 'Start-BirdBrain.mjs')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $Root $name) -Force
    }
    $lock.Dispose(); $lock = $null
    & (Join-Path $Root 'Deploy.ps1')
    Remove-LegacyDeployment $Root {
        $commit = (Get-Content -LiteralPath (Join-Path $Root 'data/app/.next/BIRD_APP_VERSION') -Raw).Trim()
        Start-BirdBrain $Root $commit
    }
    Write-Host "Migration complete. One app checkout: $Root\data\app"
    Write-Host "Server configuration: $Root\data\app\.env.local"
} finally {
    if ($lock) { $lock.Dispose() }
    $app = Join-Path $Root 'data/app'
    try {
        if (Test-Path -LiteralPath $app) {
            $owner = $task.Principal.UserId
            if ($owner -match '^S-1-') { $owner = "*$owner" }
            & icacls.exe $app /setowner $owner /T | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Could not assign the app checkout to the deployment account.' }
        }
    } finally {
        if ($wasEnabled) { Enable-ScheduledTask -TaskName 'BirdBrain Deploy' | Out-Null }
    }
}
