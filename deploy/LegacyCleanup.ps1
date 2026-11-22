function Get-LegacyEnvironmentFiles($Root) {
    $releases = Join-Path $Root 'data/releases'
    if (-not (Test-Path -LiteralPath $releases)) { return }
    Get-ChildItem -LiteralPath $releases -Directory | ForEach-Object {
        Get-ChildItem -LiteralPath $_.FullName -Filter '.env*' -File -Force |
            Where-Object { $_.Name -ne '.env.example' }
    }
}

function Initialize-AppEnvironment($Root) {
    $app = Join-Path $Root 'data/app'
    $destination = Join-Path $app '.env.local'
    $files = @(Get-LegacyEnvironmentFiles $Root)
    if (@($files | Where-Object { $_.Name -ne '.env.local' }).Count -gt 0) {
        throw 'An old release contains an unmigrated environment file. Move it to the app checkout before cleanup.'
    }
    $environments = @($files)
    if (Test-Path -LiteralPath $destination) { $environments += Get-Item -LiteralPath $destination -Force }
    $hashes = @($environments | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } | Select-Object -Unique)
    if ($hashes.Count -gt 1) { throw 'Found different .env.local files. Reconcile them before migrating; none were overwritten.' }
    New-Item -ItemType Directory -Path $app -Force | Out-Null
    if (-not (Test-Path -LiteralPath $destination)) {
        if ($files.Count -gt 0) { Copy-Item -LiteralPath $files[0].FullName -Destination $destination }
        else { Set-Content -LiteralPath $destination -Value '# Server-only configuration. This file stays outside Git.' -Encoding Ascii }
    }
}

function Remove-LegacyDeployment($Root, [scriptblock]$Verify) {
    & $Verify
    Initialize-AppEnvironment $Root
    foreach ($relative in @('data/releases', 'data/repository.git', 'data/state.json', 'ReleaseState.ps1')) {
        $path = Join-Path $Root $relative
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
    }
}
