#Requires -RunAsAdministrator
[CmdletBinding()]
param(
    [string]$Git = 'C:\Program Files\Git\cmd\git.exe',
    [string]$Node = 'C:\Program Files\nodejs\node.exe',
    [string]$DeployUser = "$env:USERDOMAIN\$env:USERNAME"
)
$ErrorActionPreference = 'Stop'
$remote = 'https://github.com/kmatthews812/birdbrain.git'
$branch = 'main'
$root = 'C:\ProgramData\Birdwatch'
$npm = Join-Path (Split-Path $Node) 'npm.cmd'
$account = New-Object Security.Principal.NTAccount($DeployUser)
$sid = $account.Translate([Security.Principal.SecurityIdentifier])
$nodeVersion = if (Test-Path -LiteralPath $Node) { & $Node --version }
if (-not (Test-Path -LiteralPath $Git) -or -not (Test-Path -LiteralPath $npm) -or $nodeVersion -notmatch '^v24\.') {
    throw 'Install machine-wide Git for Windows and Node.js 24 LTS, then retry.'
}

$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'Never'
$head = & $Git ls-remote --exit-code $remote "refs/heads/$branch"
if ($LASTEXITCODE -ne 0 -or -not $head) { throw 'Could not read birdbrain/main.' }
$commit = ($head -split '\s+')[0]
$manifest = Invoke-RestMethod -Uri "https://raw.githubusercontent.com/kmatthews812/birdbrain/$commit/package.json"
if ($manifest.name -ne 'bird-visualizer' -or -not $manifest.scripts.build -or -not $manifest.scripts.test) {
    throw 'Push the Birdwatch app commits to birdbrain/main before installing.'
}

function Invoke-Checked($Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable exited with $LASTEXITCODE." }
}

if (-not (Test-Path -LiteralPath $root)) {
    New-Item -Path $root -ItemType Directory | Out-Null
} elseif (-not (Test-Path -LiteralPath (Join-Path $root 'host.json'))) {
    throw "Installation directory already exists without Birdwatch configuration: $root"
}
Invoke-Checked icacls.exe @($root, '/inheritance:r', '/grant:r',
    '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-19:(OI)(CI)RX',
    "*${sid}:(OI)(CI)RX")

$data = Join-Path $root 'data'
$serviceLogs = Join-Path $root 'service-logs'
New-Item -Path (Join-Path $data 'releases'), $serviceLogs -ItemType Directory -Force | Out-Null
Invoke-Checked icacls.exe @($data, '/grant:r', "*${sid}:(OI)(CI)M")
Invoke-Checked icacls.exe @($serviceLogs, '/grant:r', '*S-1-5-19:(OI)(CI)M')
Copy-Item -LiteralPath @(
    (Join-Path $PSScriptRoot 'Deploy.ps1'),
    (Join-Path $PSScriptRoot 'ReleaseState.ps1'),
    (Join-Path $PSScriptRoot 'Start-Birdwatch.mjs')
) -Destination $root -Force
@{ git = $Git; node = $Node; npm = $npm; remote = $remote; branch = $branch } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'host.json') -Encoding UTF8

$wrapper = Join-Path $root 'Birdwatch.exe'
$checksum = '286c5e550c606593d249bb70599be5c9013573acb290693c3717da690bab8574'
if (-not (Test-Path -LiteralPath $wrapper) -or (Get-FileHash -LiteralPath $wrapper).Hash -ne $checksum) {
    $download = Join-Path $root 'WinSW.download'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/winsw/winsw/releases/download/v2.13.0/WinSW-x64.exe_Release' -OutFile $download
    if ((Get-FileHash -LiteralPath $download).Hash -ne $checksum) {
        throw 'WinSW checksum mismatch.'
    }
    Move-Item -LiteralPath $download -Destination $wrapper -Force
}

$nodeXml = [Security.SecurityElement]::Escape($Node)
@"
<service>
  <id>Birdwatch</id>
  <name>Birdwatch</name>
  <description>Birdbrain Next.js visualization for the local network</description>
  <executable>$nodeXml</executable>
  <arguments>"%BASE%\Start-Birdwatch.mjs" "%BASE%"</arguments>
  <workingdirectory>%BASE%</workingdirectory>
  <env name="NODE_ENV" value="production"/>
  <env name="NEXT_TELEMETRY_DISABLED" value="1"/>
  <env name="BIRDNET_BASE_URL" value="http://127.0.0.1:8080"/>
  <serviceaccount><username>NT AUTHORITY\LocalService</username></serviceaccount>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <stoptimeout>15 sec</stoptimeout>
  <onfailure action="restart" delay="30 sec"/>
  <resetfailure>1 hour</resetfailure>
  <logpath>%BASE%\service-logs</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>4</keepFiles></log>
</service>
"@ | Set-Content -LiteralPath (Join-Path $root 'Birdwatch.xml') -Encoding UTF8

if (-not (Get-Service -Name Birdwatch -ErrorAction SilentlyContinue)) {
    Invoke-Checked $wrapper @('install')
}
$descriptor = (& sc.exe sdshow Birdwatch | Where-Object { $_ -match '^D:' } | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or -not $descriptor) { throw 'Could not read Birdwatch service permissions.' }
$security = New-Object Security.AccessControl.CommonSecurityDescriptor($false, $false, $descriptor)
# Delegate only query status, start, and stop on this single service.
$security.DiscretionaryAcl.SetAccess('Allow', $sid, 0x34, 'None', 'None')
Invoke-Checked sc.exe @('sdset', 'Birdwatch', $security.GetSddlForm('All'))

if (-not (Get-NetFirewallRule -Name 'Birdwatch-Private-LAN' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name 'Birdwatch-Private-LAN' -DisplayName 'Birdwatch on private LAN' `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private `
        -RemoteAddress LocalSubnet -Program $Node | Out-Null
}

$start = (Get-Date).AddMinutes(1).ToString("yyyy-MM-ddTHH:mm:ss")
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
@"
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <TimeTrigger>
      <Repetition><Interval>PT1M</Interval></Repetition>
      <StartBoundary>$start</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Deploy">
      <UserId>$sid</UserId><LogonType>Password</LogonType><RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT30M</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Deploy"><Exec>
    <Command>$ps</Command>
    <Arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$root\Deploy.ps1"</Arguments>
    <WorkingDirectory>$root</WorkingDirectory>
  </Exec></Actions>
</Task>
"@ | Set-Variable -Name taskXml
$credential = Get-Credential -UserName $DeployUser -Message 'Enter your Windows account password to run deployments while signed out.'
if (-not $credential -or $credential.UserName -ne $DeployUser) { throw "Use account $DeployUser." }
try {
    Register-ScheduledTask -TaskName 'Birdwatch Deploy' -Xml $taskXml -User $DeployUser `
        -Password $credential.GetNetworkCredential().Password -Force | Out-Null
} finally {
    Remove-Variable credential
}
Start-ScheduledTask -TaskName 'Birdwatch Deploy'
Write-Host "Initial deployment started. Logs: $data\deploy-*.log"
