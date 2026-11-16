. (Join-Path $PSScriptRoot '..\deploy\ReleaseState.ps1')
$root = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
[IO.Directory]::CreateDirectory($root) | Out-Null
$file = Join-Path $root 'state.json'
$old = 'a' * 40
$new = 'b' * 40
$script:running = $old
$script:fail = $true
$stop = { $script:running = $null }
$start = {
    param($commit)
    $script:running = $commit
    if ($script:fail -and $commit -eq $new) { throw 'candidate unhealthy' }
}
$ErrorActionPreference = 'Stop'
try {
    Write-ReleaseState $file $old $old
    try {
        Switch-Release $file $new $old $stop $start
        throw 'Failed health check was accepted.'
    } catch {
        if ($_.Exception.Message -ne 'candidate unhealthy') { throw }
    }
    $state = Read-ReleaseState $file
    if ($state.active -ne $old -or $state.good -ne $old -or $script:running -ne $old) {
        throw 'Failed health check did not restore the previously healthy release.'
    }
    $script:fail = $false
    Switch-Release $file $new $old $stop $start
    $state = Read-ReleaseState $file
    if ($state.active -ne $new -or $state.good -ne $new -or $script:running -ne $new) {
        throw 'Healthy release was not committed.'
    }
    Write-Host 'Release activation tests passed.'
} finally {
    [IO.Directory]::Delete($root, $true)
}
