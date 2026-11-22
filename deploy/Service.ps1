function Get-BirdBrainProcesses($Root) {
    $prefix = [regex]::Escape($Root.Replace('/', '\').TrimEnd('\'))
    $node = '^(?:"[^"]*\\node\.exe"|[^\s"]*node\.exe)\s+"?'
    $launcher = $node + $prefix + '\\Start-BirdBrain\.mjs(?=$|[\s"])'
    $next = $node + $prefix + '\\data\\(?:app|releases\\[0-9a-f]{40})\\node_modules\\next\\dist\\bin\\next(?=$|[\s"])'
    foreach ($process in (Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop)) {
        if (-not $process.CommandLine) { continue }
        $command = $process.CommandLine.Replace('/', '\')
        if ($command -match $launcher) {
            [pscustomobject]@{ Id = $process.ProcessId; Kind = 'launcher' }
        } elseif ($command -match $next) {
            [pscustomobject]@{ Id = $process.ProcessId; Kind = 'next' }
        }
    }
}

function Get-BirdBrainListeners {
    Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq 3000 }
}

function Stop-BirdBrain($Root) {
    $service = Get-Service -Name BirdBrain -ErrorAction Stop
    if ($service.Status -ne 'Stopped') {
        if ($service.Status -ne 'StopPending') {
            & sc.exe stop BirdBrain | Out-Null
            if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1062) { throw 'Could not stop BirdBrain.' }
        }
        $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
    }
    foreach ($process in @(Get-BirdBrainProcesses $Root)) {
        & taskkill.exe /PID $process.Id /T /F | Out-Null
        if ($LASTEXITCODE -ne 0 -and @(Get-BirdBrainProcesses $Root | Where-Object { $_.Id -eq $process.Id }).Count -gt 0) {
            throw "Could not stop BirdBrain process $($process.Id)."
        }
    }
    if (@(Get-BirdBrainProcesses $Root).Count -gt 0) { throw 'BirdBrain processes are still running.' }
    if (@(Get-BirdBrainListeners).Count -gt 0) { throw 'Port 3000 is occupied by an unrelated process; it was not stopped.' }
}

function Start-BirdBrain($Root, $Commit) {
    $service = Get-Service -Name BirdBrain -ErrorAction Stop
    if ($service.Status -eq 'Stopped') {
        & sc.exe start BirdBrain | Out-Null
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1056) { throw 'Could not start BirdBrain.' }
    }
    $until = (Get-Date).AddSeconds(45)
    do {
        $result = $null
        try { $result = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/version' -TimeoutSec 2 }
        catch { }
        if ($result.version -ceq $Commit) {
            # LocalService command lines may be hidden from the deploy account.
            $serviceProcess = Get-CimInstance -ClassName Win32_Service -Filter "Name = 'BirdBrain'" -ErrorAction Stop
            $nodes = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'node.exe'" -ErrorAction Stop)
            $descendants = @()
            $parents = @($serviceProcess.ProcessId)
            while ($serviceProcess.ProcessId -gt 0 -and $parents.Count -gt 0) {
                $children = @($nodes | Where-Object { $_.ParentProcessId -in $parents -and $_.ProcessId -notin $descendants.ProcessId })
                $descendants += $children
                $parents = @($children | Select-Object -ExpandProperty ProcessId)
            }
            $owners = @(Get-BirdBrainListeners | Select-Object -ExpandProperty OwningProcess -Unique)
            $owner = @($descendants | Where-Object { $_.ProcessId -in $owners })
            $extras = @(Get-BirdBrainProcesses $Root | Where-Object { $_.Id -notin $descendants.ProcessId })
            if ($descendants.Count -ne 2 -or $owners.Count -ne 1 -or $owner.Count -ne 1 -or
                $owner[0].ParentProcessId -notin $descendants.ProcessId -or $extras.Count -gt 0) {
                throw 'Expected exactly one BirdBrain Next server owning port 3000 beneath its service launcher.'
            }
            return
        }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $until)
    throw "BirdBrain health check failed for $Commit."
}
