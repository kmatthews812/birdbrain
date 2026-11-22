$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\deploy\Service.ps1')
$root = 'C:\ProgramData\BirdBrain'
$commit = 'a' * 40

function Assert-Equal($Actual, $Expected, $Message) {
    if (($Actual | ConvertTo-Json -Compress -Depth 8) -cne ($Expected | ConvertTo-Json -Compress -Depth 8)) {
        throw "$Message. Actual: $($Actual | ConvertTo-Json -Compress -Depth 8)"
    }
}
function Assert-Throws([scriptblock]$Action, $Message) {
    try { & $Action } catch {
        if ($_.Exception.Message -like $Message) { return }
        throw
    }
    throw 'Expected operation to fail.'
}
function Reset-Fixture {
    $script:events = [Collections.Generic.List[string]]::new()
    $script:status = 'Running'
    $script:processes = @()
    $script:listeners = @()
    $script:version = $commit
}
function New-Node($Id, $CommandLine) {
    [pscustomobject]@{ ProcessId = $Id; Name = 'node.exe'; CommandLine = $CommandLine }
}
function Get-Service {
    param($Name)
    Assert-Equal $Name 'BirdBrain' 'Wrong service queried'
    $service = [pscustomobject]@{ Status = $script:status }
    $service | Add-Member -MemberType ScriptMethod -Name WaitForStatus -Value {
        param($Status, $Timeout)
        $script:events.Add("wait:$Status")
        Assert-Equal ([int]$Timeout.TotalSeconds) 30 'Stop timeout changed'
        $script:status = $Status
    }
    $service
}
function sc.exe {
    param($Action, $Name)
    Assert-Equal $Name 'BirdBrain' 'Wrong service changed'
    $script:events.Add("service:$Action")
    if ($Action -eq 'start') { $script:status = 'Running' }
    $global:LASTEXITCODE = 0
}
function Get-CimInstance {
    param($ClassName, $Filter)
    Assert-Equal $ClassName 'Win32_Process' 'Wrong process query'
    $script:processes
}
function taskkill.exe {
    param($PidFlag, $ProcessId, $TreeFlag, $ForceFlag)
    Assert-Equal @($PidFlag, $TreeFlag, $ForceFlag) @('/PID', '/T', '/F') 'Must kill exact process tree'
    $script:events.Add("kill:$ProcessId")
    $script:processes = @($script:processes | Where-Object { $_.ProcessId -ne $ProcessId })
    $script:listeners = @($script:listeners | Where-Object { $_.OwningProcess -ne $ProcessId })
    $global:LASTEXITCODE = 0
}
function Get-NetTCPConnection {
    param($LocalPort, $State, $ErrorAction)
    Assert-Equal $LocalPort $null 'Inspect listeners before filtering to port 3000'
    Assert-Equal $State 'Listen' 'Must inspect listeners'
    $script:listeners
}
function Invoke-RestMethod {
    param($Uri, $TimeoutSec)
    Assert-Equal $Uri 'http://127.0.0.1:3000/api/version' 'Wrong health endpoint'
    [pscustomobject]@{ version = $script:version }
}

Reset-Fixture
$script:processes = @(
    (New-Node 10 '"C:\Program Files\nodejs\node.exe" "C:\ProgramData\BirdBrain\Start-BirdBrain.mjs" "C:\ProgramData\BirdBrain"'),
    (New-Node 11 'node.exe C:/ProgramData/BirdBrain/data/app/node_modules/next/dist/bin/next start'),
    (New-Node 12 "node.exe C:\ProgramData\BirdBrain\data\releases\$commit\node_modules\next\dist\bin\next start"),
    (New-Node 20 'node.exe C:\OtherApp\node_modules\next\dist\bin\next start'),
    (New-Node 21 'node.exe C:\ProgramData\BirdBrain-other\Start-BirdBrain.mjs'),
    (New-Node 22 'node.exe C:\ProgramData\BirdBrain\data\releases\not-a-commit\node_modules\next\dist\bin\next start'),
    (New-Node 23 'node.exe C:\ProgramData\BirdBrain\data\app\node_modules\next\dist\bin\next-other start'),
    (New-Node 24 'node.exe C:\OtherApp\inspect.js C:\ProgramData\BirdBrain\Start-BirdBrain.mjs')
)
$script:listeners = @([pscustomobject]@{ LocalPort = 3000; OwningProcess = 11 })
Stop-BirdBrain -Root $root
Assert-Equal @($script:events) @('service:stop', 'wait:Stopped', 'kill:10', 'kill:11', 'kill:12') 'Stop must precede narrow cleanup'
Assert-Equal @($script:processes.ProcessId) @(20, 21, 22, 23, 24) 'Unrelated processes must survive'

Reset-Fixture
$script:status = 'Stopped'
$script:processes = @((New-Node 20 'node.exe C:\OtherApp\next start'))
$script:listeners = @([pscustomobject]@{ LocalPort = 3000; OwningProcess = 20 })
Assert-Throws { Stop-BirdBrain -Root $root } '*Port 3000*'
Assert-Equal @($script:events) @() 'Must not kill unrelated port holder'
Assert-Equal @($script:processes.ProcessId) @(20) 'Unrelated server remains untouched'

Reset-Fixture
$script:status = 'Stopped'
$script:processes = @(
    (New-Node 10 'node.exe C:\ProgramData\BirdBrain\Start-BirdBrain.mjs'),
    (New-Node 11 'node.exe C:\ProgramData\BirdBrain\data\app\node_modules\next\dist\bin\next start')
)
$script:listeners = @([pscustomobject]@{ LocalPort = 3000; OwningProcess = 11 }, [pscustomobject]@{ LocalPort = 3000; OwningProcess = 11 })
Start-BirdBrain -Root $root -Commit $commit
Start-BirdBrain -Root $root -Commit $commit
Assert-Equal @($script:events) @('service:start') 'An already running service must not launch another server'

$script:processes += New-Node 12 "node.exe C:\ProgramData\BirdBrain\data\releases\$commit\node_modules\next\dist\bin\next start"
Assert-Throws { Start-BirdBrain -Root $root -Commit $commit } '*exactly one BirdBrain Next server*'
Assert-Equal @($script:events) @('service:start') 'Duplicate detection must not start another service'

Reset-Fixture
$script:processes = @((New-Node 11 'node.exe C:\ProgramData\BirdBrain\data\app\node_modules\next\dist\bin\next start'))
$script:listeners = @([pscustomobject]@{ LocalPort = 3000; OwningProcess = 20 })
Assert-Throws { Start-BirdBrain -Root $root -Commit $commit } '*exactly one BirdBrain Next server*'

Write-Host 'Service lifecycle tests passed.'
