$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot '.runtime\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No owned workbench process recorded.'; exit 0 }
$servicePid = [int](Get-Content -LiteralPath $pidFile)
$serviceInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $servicePid" -ErrorAction SilentlyContinue
$expectedServer = Join-Path $PSScriptRoot 'server.mjs'
if ($serviceInfo -and $serviceInfo.CommandLine -and $serviceInfo.CommandLine.Contains($expectedServer)) {
    Stop-Process -Id $servicePid
    Write-Output 'Review workbench stopped. Media and feedback are preserved.'
} elseif ($serviceInfo) {
    throw 'Recorded process does not match this workbench. Nothing was stopped.'
} else { Write-Output 'The workbench process has already stopped.' }
