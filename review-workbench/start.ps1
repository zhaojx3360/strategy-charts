param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$appPort = 4317
$appUrl = "http://127.0.0.1:$appPort"
$appRuntime = Join-Path $appRoot '.runtime'
New-Item -ItemType Directory -Path $appRuntime -Force | Out-Null
try {
    $existing = Invoke-RestMethod -Uri "$appUrl/api/health" -TimeoutSec 2
    if ($existing.app -eq 'local-review-workbench') {
        Write-Output "Review workbench is already running: $appUrl"
        if (-not $NoBrowser) { Start-Process $appUrl }
        exit 0
    }
    throw 'Port 4317 is occupied by a different service.'
} catch {
    if ($_.Exception.Message -like '*different service*') { throw }
}
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { 'C:\Users\18290\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js 22 or newer is required.' }
$service = Start-Process -FilePath $nodePath -ArgumentList ('"' + (Join-Path $appRoot 'server.mjs') + '"') -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $appRuntime 'server.log') -RedirectStandardError (Join-Path $appRuntime 'server-error.log') -PassThru
$service.Id | Set-Content -LiteralPath (Join-Path $appRuntime 'server.pid') -Encoding ascii
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 200
    try {
        $health = Invoke-RestMethod -Uri "$appUrl/api/health" -TimeoutSec 1
        if ($health.app -eq 'local-review-workbench') { $ready = $true; break }
    } catch { }
    if ($service.HasExited) { break }
}
if (-not $ready) { throw "Could not start the workbench. See $appRuntime\server-error.log" }
Write-Output "Review workbench: $appUrl"
if (-not $NoBrowser) { Start-Process $appUrl }
