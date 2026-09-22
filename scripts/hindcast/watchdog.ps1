# watchdog.ps1 - AP10a: keeps the full-range chains of queue.mjs alive until each has written "DONE <mode>" into its
# log, and holds off idle sleep meanwhile (SetThreadExecutionState, like keep-awake.ps1). Every chain is resumable
# (extractors skip cached files, build-slots skips existing slots), so a restart only costs the file in flight.
# Measured 19.09.: detached Bash chains died silently mid-run several times; the machine slept 02:22-10:28 local time.
#
#   powershell -File scripts/hindcast/watchdog.ps1            (reads <HINDCAST_ROOT>\log\chains.json; start it detached)
#
# chains.json: [{ "name": "full-dyn", "mode": "dyn", "args": "" }, ...] - log log\pull-<name>.log, restarts in log\watchdog.log
param([string]$Root = 'C:\dev\buscosun-hindcast', [string]$Cwd = 'C:\dev\buscosun-web', [int]$EveryS = 300, [int]$MaxRestarts = 40)
Add-Type -Name Power -Namespace HCW -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$ES_CONTINUOUS = [uint32]'0x80000000'; $ES_SYSTEM_REQUIRED = [uint32]'0x00000001'
$wlog = Join-Path $Root 'log\watchdog.log'
$restarts = @{}
function Say($m) { Add-Content -Path $wlog -Value ("{0} {1}" -f (Get-Date).ToUniversalTime().ToString('s'), $m) -Encoding utf8 }
Say "start (every $EveryS s, max $MaxRestarts restarts per chain)"
while ($true) {
  $chains = Get-Content (Join-Path $Root 'log\chains.json') -Raw | ConvertFrom-Json
  $open = 0
  $procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue)
  foreach ($c in $chains) {
    $log = Join-Path $Root "log\pull-$($c.name).log"
    if ((Test-Path $log) -and (Select-String -Path $log -SimpleMatch "DONE $($c.mode)" -Quiet)) { continue }
    $open++
    $marker = ("queue.mjs $($c.mode) $($c.args)").Trim()
    $alive = @($procs | Where-Object { $_.CommandLine -like "*$marker*" }).Count -gt 0
    if ($alive) { continue }
    $n = [int]$restarts[$c.name]
    if ($n -ge $MaxRestarts) { Say "$($c.name): $n restarts - gave up"; continue }
    $restarts[$c.name] = $n + 1
    $cmd = "node --max-old-space-size=8192 --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/hindcast/queue.mjs $($c.mode) $($c.args)".Trim()
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Cwd 'scripts\hindcast\detach.ps1') -Name $c.name -Shell cmd -Command $cmd
    Say "$($c.name): (re)start #$($n + 1) - $out"
  }
  if ($open -eq 0) { Say 'all chains done'; break }
  [void][HCW.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED)
  Start-Sleep -Seconds $EveryS
}
[void][HCW.Power]::SetThreadExecutionState($ES_CONTINUOUS)
