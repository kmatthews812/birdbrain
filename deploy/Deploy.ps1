$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'ReleaseState.ps1')
$config = Get-Content -LiteralPath (Join-Path $root 'host.json') -Raw | ConvertFrom-Json
$data = Join-Path $root 'data'
$statePath = Join-Path $data 'state.json'
$repo = Join-Path $data 'repository.git'
$releases = Join-Path $data 'releases'
$log = Join-Path $data "deploy-$(Get-Date -Format yyyy-MM-dd).log"
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'Never'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:Path = "$(Split-Path $config.node);$env:Path"

try {
    $lock = [IO.File]::Open((Join-Path $data 'deploy.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
} catch [IO.IOException] {
    if (($_.Exception.HResult -band 0xffff) -eq 32) { exit 0 }
    throw
}

function Write-DeployLog($Message) {
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) $Message"
}

function Invoke-Step($Executable, [string[]]$Arguments) {
    # Windows PowerShell can turn redirected native stderr into ErrorRecords.
    $ErrorActionPreference = 'Continue'
    & $Executable @Arguments 2>&1 | Out-File -LiteralPath $log -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        throw "$(Split-Path $Executable -Leaf) failed with exit code $LASTEXITCODE."
    }
}

function Stop-App {
    $service = Get-Service -Name BirdBrain
    if ($service.Status -ne 'Stopped') {
        & sc.exe stop BirdBrain | Out-Null
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1062) { throw 'Could not stop BirdBrain.' }
        $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
    }
}

function Start-App($Commit) {
    & sc.exe start BirdBrain | Out-Null
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1056) { throw 'Could not start BirdBrain.' }
    $until = (Get-Date).AddSeconds(45)
    do {
        try {
            $result = Invoke-RestMethod 'http://127.0.0.1:3000/api/version' -TimeoutSec 2
            if ($result.version -ceq $Commit) { return }
        } catch {
            # Retry while the service is starting.
        }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $until)
    throw "Health check failed for $Commit."
}


try {
    $state = Read-ReleaseState $statePath
    if ($state.active -ne $state.good) {
        Write-DeployLog 'Recovering an interrupted deployment.'
        Restore-Release $statePath $state.good { Stop-App } { param($id) Start-App $id }
    }

    if (-not (Test-Path -LiteralPath (Join-Path $repo 'HEAD'))) {
        Invoke-Step $config.git @('init', '--bare', $repo)
    }
    $ref = "refs/heads/$($config.branch)"
    Invoke-Step $config.git @('--git-dir', $repo, 'fetch', '--no-tags', $config.remote, "+${ref}:refs/deploy/candidate")
    $commit = & $config.git --git-dir $repo rev-parse refs/deploy/candidate
    if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the fetched branch.' }
    Assert-ReleaseCommit $commit
    if ($state.good -eq $commit) {
        if ((Get-Service -Name BirdBrain).Status -eq 'Stopped') { Start-App $commit }
        return
    }

    Write-DeployLog "Preparing $commit."
    $release = Join-Path $releases $commit
    if (Test-Path -LiteralPath $release) {
        # This path is a validated commit beneath releases and differs from the current release.
        Remove-Item -LiteralPath $release -Recurse -Force
    }
    New-Item -ItemType Directory -Path $release | Out-Null
    $archive = Join-Path $data 'candidate.zip'
    Invoke-Step $config.git @('--git-dir', $repo, 'archive', '--format=zip', '-o', $archive, $commit)
    Expand-Archive -LiteralPath $archive -DestinationPath $release
    Remove-Item -LiteralPath $archive
    Push-Location -LiteralPath $release
    try {
        Invoke-Step $config.npm @('ci', '--no-audit', '--no-fund')
        Invoke-Step $config.npm @('test')
        Invoke-Step $config.npm @('run', 'build')
    } finally {
        Pop-Location
    }

    try {
        Switch-Release $statePath $commit $state.good { Stop-App } { param($id) Start-App $id }
    } catch {
        Write-DeployLog "Activation failed for $commit. Last known healthy release: $($state.good)."
        throw
    }
    Write-DeployLog "Activated $commit."
} catch {
    Write-DeployLog "ERROR: $($_.Exception.Message)"
    throw
} finally {
    $lock.Dispose()
}
