$ErrorActionPreference = 'Stop'
Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.Tests.ps1' | ForEach-Object {
    & $_.FullName
}
