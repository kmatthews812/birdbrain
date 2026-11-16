function Assert-ReleaseCommit($Commit) {
    if ($null -ne $Commit -and $Commit -cnotmatch '^[0-9a-f]{40}$') {
        throw 'Invalid release commit.'
    }
}

function Read-ReleaseState($Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return @{ active = $null; good = $null } }
    $state = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    Assert-ReleaseCommit $state.active
    Assert-ReleaseCommit $state.good
    return $state
}

function Write-ReleaseState($Path, $Active, $Good) {
    Assert-ReleaseCommit $Active
    Assert-ReleaseCommit $Good
    $temp = "$Path.$([guid]::NewGuid()).tmp"
    try {
        @{ active = $Active; good = $Good } | ConvertTo-Json -Compress |
            Set-Content -LiteralPath $temp -Encoding Ascii
        if ([IO.File]::Exists($Path)) {
            [IO.File]::Replace($temp, $Path, "$temp.bak")
        } else {
            [IO.File]::Move($temp, $Path)
        }
    } finally {
        [IO.File]::Delete($temp)
        [IO.File]::Delete("$temp.bak")
    }
}


function Restore-Release($Path, $Commit, [scriptblock]$Stop, [scriptblock]$Start) {
    & $Stop
    Write-ReleaseState $Path $Commit $Commit
    if ($Commit) { & $Start $Commit }
}

function Switch-Release($Path, $Commit, $Previous, [scriptblock]$Stop, [scriptblock]$Start) {
    & $Stop
    try {
        Write-ReleaseState $Path $Commit $Previous
        & $Start $Commit
        Write-ReleaseState $Path $Commit $Commit
    } catch {
        Restore-Release $Path $Previous $Stop $Start
        throw
    }
}
