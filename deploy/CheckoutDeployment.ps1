function Invoke-CheckoutGit($Git, $App, [string[]]$Arguments) {
    $output = & $Git -C $App @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Git $($Arguments[0]) failed with exit code $LASTEXITCODE." }
    return $output
}

function Invoke-CheckoutDeployment($App, $Git, $Remote, $Branch, [scriptblock]$Stop, [scriptblock]$Build, [scriptblock]$Start) {
    if (-not (Test-Path -LiteralPath (Join-Path $App '.git'))) {
        New-Item -ItemType Directory -Path $App -Force | Out-Null
        Invoke-CheckoutGit $Git $App @('init', '-b', $Branch) | Out-Null
    }
    $changes = Invoke-CheckoutGit $Git $App @('status', '--porcelain', '--untracked-files=no')
    if ($changes) { throw 'The app checkout has local changes; refusing to overwrite them.' }
    $currentBranch = Invoke-CheckoutGit $Git $App @('symbolic-ref', '--short', 'HEAD')
    if ($currentBranch -ne $Branch) { throw "Expected app branch $Branch, found $currentBranch." }
    Invoke-CheckoutGit $Git $App @('fetch', '--no-tags', $Remote, "refs/heads/$Branch") | Out-Null
    $commit = Invoke-CheckoutGit $Git $App @('rev-parse', 'FETCH_HEAD')
    if ($commit -cnotmatch '^[0-9a-f]{40}$') { throw 'Invalid fetched commit.' }
    if (Invoke-CheckoutGit $Git $App @('ls-tree', '--name-only', $commit, '--', '.env.local')) {
        throw 'The remote tracks .env.local; refusing to overwrite the local environment.'
    }
    & $Git -C $App show-ref --verify --quiet "refs/heads/$Branch"
    $hasHead = $LASTEXITCODE -eq 0
    if ($hasHead) {
        & $Git -C $App merge-base --is-ancestor HEAD $commit
        if ($LASTEXITCODE -ne 0) { throw 'The app checkout has diverged; refusing a non-fast-forward update.' }
    }
    $marker = Join-Path $App '.next/BIRD_APP_VERSION'
    if ($hasHead -and (Test-Path -LiteralPath $marker) -and
        (Get-Content -LiteralPath $marker -Raw).Trim() -ceq $commit) {
        & $Start $commit
        return
    }
    & $Stop
    if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }
    if ($hasHead) {
        Invoke-CheckoutGit $Git $App @('merge', '--ff-only', $commit) | Out-Null
    } else {
        Invoke-CheckoutGit $Git $App @('checkout', '-b', $Branch, $commit) | Out-Null
    }
    & $Git -C $App check-ignore -q .env.local
    if ($LASTEXITCODE -ne 0) { throw '.env.local must remain Git-ignored.' }
    & $Build $App
    Set-Content -LiteralPath $marker -Value $commit -Encoding Ascii
    & $Start $commit
}
