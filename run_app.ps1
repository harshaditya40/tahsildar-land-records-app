# TAHSILDAR - PowerShell Runner
Set-Location $PSScriptRoot

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  TAHSILDAR - Land Records & Services (SIH26014)" -ForegroundColor White
Write-Host "  Department of Land Resources (DoLR), Govt of India" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# Detect python
$pyCmd = "python"
if (Get-Command py -ErrorAction SilentlyContinue) {
    $pyCmd = "py"
} elseif (Test-Path "..\.venv\Scripts\python.exe") {
    $pyCmd = "..\.venv\Scripts\python.exe"
}

Write-Host "[INFO] Detected Python: $pyCmd" -ForegroundColor Green
Write-Host "[INFO] Starting server at http://localhost:8000 ..." -ForegroundColor Cyan
Write-Host ""

# Launch browser after 2 seconds
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:8000"
} | Out-Null

if ($pyCmd -eq "py") {
    py -3 server.py
} else {
    & $pyCmd server.py
}
