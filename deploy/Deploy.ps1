$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'CheckoutDeployment.ps1')
. (Join-Path $root 'Service.ps1')
$config = Get-Content -LiteralPath (Join-Path $root 'host.json') -Raw | ConvertFrom-Json
$data = Join-Path $root 'logs'
$app = Join-Path $root 'app'
$log = Join-Path $data "deploy-$(Get-Date -Format yyyy-MM-dd).log"
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'Never'
$env:NEXT_TELEMETRY_DISABLED = '1'
$env:Path = "$(Split-Path $config.node);$env:Path"

try {
    $lock = [IO.File]::Open((Join-Path $data 'deploy.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
} catch [IO.IOException] {
    if (($_.Exception.HResult -band 0xffff) -eq 32) { return }
    throw
}

function Invoke-Step($Executable, [string[]]$Arguments) {
    $ErrorActionPreference = 'Continue'
    & $Executable @Arguments 2>&1 | Out-File -LiteralPath $log -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "$(Split-Path $Executable -Leaf) failed with exit code $LASTEXITCODE." }
}

try {
    Invoke-CheckoutDeployment $app $config.git $config.remote $config.branch `
        { Stop-BirdBrain $root } `
        {
            param($path, $install)
            Push-Location -LiteralPath $path
            try {
                if ($install) { Invoke-Step $config.npm @('ci', '--no-audit', '--no-fund') }
                Invoke-Step $config.npm @('test')
                & (Join-Path $path 'tests/Run-DeploymentTests.ps1') *>> $log
            } finally { Pop-Location }
        } `
        { param($commit) Start-BirdBrain $root $commit }
} catch {
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) ERROR: $($_.Exception.Message)"
    throw
} finally { $lock.Dispose() }
