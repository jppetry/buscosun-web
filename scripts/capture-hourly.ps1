# Hourly fusion-fixture capture wrapper (run by Windows Task Scheduler).
# Appends a real session-<validTime>.json to fixtures/ each hour so the
# verification archive grows with NO Claude session running. Idempotent per
# hour (same validTime overwrites). Logs to fixtures/capture.log.
#
# NODE_NO_WARNINGS avoids the experimental-strip-types stderr warning (which
# PowerShell 5.1 would otherwise treat as a terminating error); success/failure
# is judged by the real process exit code, not by stderr.
$repo = Split-Path -Parent $PSScriptRoot          # scripts/ -> repo root
Set-Location $repo
$fixtures = Join-Path $repo 'fixtures'
if (-not (Test-Path $fixtures)) { New-Item -ItemType Directory -Force $fixtures | Out-Null }
$log = Join-Path $fixtures 'capture.log'
$stamp = (Get-Date).ToString('s')
$env:NODE_NO_WARNINGS = '1'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Add-Content $log "$stamp FAIL node not found on PATH"; exit 1 }
# Training capture: useOpenMeteo:false (hardcoded). Verification captures add
# '--with-openmeteo' (Open-Meteo is stripped from training, constraint C1).
& $node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/capture-fixture.mjs 2>&1 |
  Out-File -Append -Encoding utf8 $log
if ($LASTEXITCODE -eq 0) { Add-Content $log "$stamp OK" } else { Add-Content $log "$stamp FAIL exit=$LASTEXITCODE"; exit 1 }
