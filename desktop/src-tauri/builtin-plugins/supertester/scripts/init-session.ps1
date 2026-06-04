# Initialize .supertester/ directory from templates
# Usage: .\init-session.ps1 [-ProjectDir <path>]

param(
    [string]$ProjectDir = "."
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginRoot = Split-Path -Parent $ScriptDir
$SupertesterDir = Join-Path $ProjectDir ".supertester"

if (Test-Path $SupertesterDir) {
    Write-Host "Session already exists at $SupertesterDir"
    Write-Host "Use session-catchup.py to resume."
    exit 0
}

# Create directory structure
$dirs = @("requirements", "test-cases", "scripts", "reviews", "reports")
foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Path (Join-Path $SupertesterDir $dir) -Force | Out-Null
}

# Copy templates
Copy-Item (Join-Path $PluginRoot "templates\test_plan.md") (Join-Path $SupertesterDir "test_plan.md")
Copy-Item (Join-Path $PluginRoot "templates\findings.md") (Join-Path $SupertesterDir "findings.md")
Copy-Item (Join-Path $PluginRoot "templates\progress.md") (Join-Path $SupertesterDir "progress.md")

# Set session date
$today = Get-Date -Format "yyyy-MM-dd"
$progressPath = Join-Path $SupertesterDir "progress.md"
(Get-Content $progressPath) -replace '\[DATE\]', $today | Set-Content $progressPath

Write-Host "Initialized .supertester/ session at $SupertesterDir"
Write-Host "Core files:"
Write-Host "  - test_plan.md   (phase tracking + decisions)"
Write-Host "  - findings.md    (knowledge base)"
Write-Host "  - progress.md    (session log)"
Write-Host ""
Write-Host "Output directories:"
Write-Host "  - requirements/  (Phase 1-2)"
Write-Host "  - test-cases/    (Phase 3-4)"
Write-Host "  - scripts/       (Phase 5)"
Write-Host "  - reviews/       (test-reviewer records)"
Write-Host "  - reports/       (Phase 6)"
