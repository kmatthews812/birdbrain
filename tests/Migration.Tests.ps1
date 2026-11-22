$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
$source = Join-Path $root 'source'
$hostRoot = Join-Path $root 'host'
$global:migrationEvents = [Collections.Generic.List[string]]::new()
$global:migrationFail = $false
function global:Get-ScheduledTask { param($TaskName) return [pscustomobject]@{ State = 'Ready'; Settings = [pscustomobject]@{ Enabled = $true }; Principal = [pscustomobject]@{ UserId = 'test-deploy-user' } } }
function global:Disable-ScheduledTask { param($TaskName) $global:migrationEvents.Add('disable') }
function global:icacls.exe {
    param($Path, $Operation, $Owner, $Recursive)
    if ($Operation -eq '/grant') { $global:LASTEXITCODE = 0; return }
    if ($Operation -ne '/setowner' -or $Owner -ne 'test-deploy-user' -or $Recursive -ne '/T') { throw 'Incorrect ownership transfer' }
    $global:migrationEvents.Add('ownership'); $global:LASTEXITCODE = 0
}
function global:Enable-ScheduledTask { param($TaskName) $global:migrationEvents.Add('enable') }
try {
    New-Item -ItemType Directory -Path $source, (Join-Path $hostRoot 'app'), (Join-Path $hostRoot 'data') -Force | Out-Null
    '{}' | Set-Content (Join-Path $hostRoot 'host.json')
    ('a' * 40) | Set-Content (Join-Path $hostRoot 'app/.birdbrain-version')
    ((Get-Content (Join-Path $PSScriptRoot '../deploy/Migrate-Host.ps1') -Raw) -replace '#Requires -RunAsAdministrator', '') | Set-Content (Join-Path $source 'Migrate-Host.ps1')
    'function Stop-BirdBrain($Root) { $global:migrationEvents.Add("stop") }; function Start-BirdBrain($Root, $Commit) { $global:migrationEvents.Add("verify") }' | Set-Content (Join-Path $source 'Service.ps1')
    'function Initialize-AppEnvironment($Root) { $global:migrationEvents.Add("environment") }; function Remove-LegacyDeployment($Root, [scriptblock]$Verify) { & $Verify; $global:migrationEvents.Add("cleanup") }' | Set-Content (Join-Path $source 'LegacyCleanup.ps1')
    '# checkout' | Set-Content (Join-Path $source 'CheckoutDeployment.ps1')
    '// launcher' | Set-Content (Join-Path $source 'Start-BirdBrain.mjs')
    '$global:migrationEvents.Add("deploy"); if ($global:migrationFail) { throw "build failed" }' | Set-Content (Join-Path $source 'Deploy.ps1')
    & (Join-Path $source 'Migrate-Host.ps1') -Root $hostRoot
    if (($global:migrationEvents -join ',') -ne 'disable,environment,stop,deploy,verify,cleanup,ownership,enable') { throw "Wrong migration order: $global:migrationEvents" }
    if ((Get-Content (Join-Path $hostRoot 'Start-BirdBrain.mjs')).Trim() -ne '// launcher') { throw 'Launcher not installed' }
    $global:migrationEvents.Clear(); $global:migrationFail = $true
    try { & (Join-Path $source 'Migrate-Host.ps1') -Root $hostRoot; throw 'Migration failure ignored' }
    catch { if ($_.Exception.Message -ne 'build failed') { throw } }
    if (($global:migrationEvents -join ',') -ne 'disable,environment,stop,deploy,ownership,enable') { throw 'Failure deleted releases or left task disabled' }
    Write-Host 'Host migration tests passed.'
} finally {
    foreach ($name in @('Get-ScheduledTask', 'Disable-ScheduledTask', 'Enable-ScheduledTask', 'icacls.exe')) { Remove-Item "Function:\$name" }
    Remove-Variable migrationEvents, migrationFail -Scope Global
    Remove-Item -LiteralPath $root -Recurse -Force
}
