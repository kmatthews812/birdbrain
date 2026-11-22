$ErrorActionPreference = 'Stop'
$root = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
$global:deployTestEvents = [Collections.Generic.List[string]]::new()
$global:deployTestFail = $false
function global:Test-Npm {
    param($Command, $Other, $More)
    $global:deployTestEvents.Add("npm:$Command $Other $More".TrimEnd())
    $global:LASTEXITCODE = if ($global:deployTestFail -and $Command -eq 'test') { 1 } else { 0 }
}
try {
    New-Item -ItemType Directory -Path (Join-Path $root 'app'), (Join-Path $root 'logs') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $root 'app/tests') -Force | Out-Null
    '$global:deployTestEvents.Add("deployment-tests")' | Set-Content (Join-Path $root 'app/tests/Run-DeploymentTests.ps1')
    Copy-Item (Join-Path $PSScriptRoot '../deploy/Deploy.ps1') $root
    @{ git = 'test-git'; node = '/usr/bin/node'; npm = 'Test-Npm'; remote = 'test-remote'; branch = 'main' } | ConvertTo-Json | Set-Content (Join-Path $root 'host.json')
    @'
function Stop-BirdBrain($Root) { $global:deployTestEvents.Add('stop') }
function Start-BirdBrain($Root, $Commit) { $global:deployTestEvents.Add("start:$Commit") }
'@ | Set-Content (Join-Path $root 'Service.ps1')
    @'
function Invoke-CheckoutDeployment($App, $Git, $Remote, $Branch, [scriptblock]$Stop, [scriptblock]$Build, [scriptblock]$Start) {
    if ($App -ne (Join-Path $PSScriptRoot 'app') -or $Git -ne 'test-git' -or $Remote -ne 'test-remote' -or $Branch -ne 'main') { throw 'Wrong deployment inputs' }
    & $Stop
    & $Build $App $true
    & $Start ('a' * 40)
}
'@ | Set-Content (Join-Path $root 'CheckoutDeployment.ps1')
    & (Join-Path $root 'Deploy.ps1')
    $expected = 'stop,npm:ci --no-audit --no-fund,npm:test,deployment-tests,start:' + ('a' * 40)
    if (($global:deployTestEvents -join ',') -ne $expected) { throw "Incorrect deployment order: $global:deployTestEvents" }
    $global:deployTestEvents.Clear(); $global:deployTestFail = $true
    try { & (Join-Path $root 'Deploy.ps1'); throw 'Failed tests accepted' }
    catch { if ($_.Exception.Message -notmatch 'failed with exit code 1') { throw } }
    if (($global:deployTestEvents -join ',') -ne 'stop,npm:ci --no-audit --no-fund,npm:test') { throw 'Build/start ran after failed tests' }
    Write-Host 'Deploy wiring tests passed.'
} finally {
    Remove-Item Function:\Test-Npm
    Remove-Variable deployTestEvents, deployTestFail -Scope Global
    Remove-Item -LiteralPath $root -Recurse -Force
}
