$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\deploy\ReleaseState.ps1')
$directory = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
[IO.Directory]::CreateDirectory($directory) | Out-Null
$file = Join-Path $directory 'state.json'
$old = ('a' * 40)
$new = ('b' * 40)
try {
    if ((Read-ReleaseState $file).active) { throw 'Missing state should be empty.' }
    Write-ReleaseState $file $old $old
    Write-ReleaseState $file $new $old
    $state = Read-ReleaseState $file
    if ($state.active -ne $new -or $state.good -ne $old) { throw 'Pending release lost the rollback commit.' }
    Write-ReleaseState $file $state.good $state.good
    $state = Read-ReleaseState $file
    if ($state.active -ne $old -or $state.good -ne $old) { throw 'Rollback failed.' }
    try {
        Write-ReleaseState $file '..\untrusted' $old
        throw 'Invalid release was accepted.'
    } catch {
        if ($_.Exception.Message -ne 'Invalid release commit.') { throw }
    }
    Write-Host 'Release state tests passed.'
} finally {
    [IO.Directory]::Delete($directory, $true)
}
