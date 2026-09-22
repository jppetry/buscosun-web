# detach.ps1 - AP10a: starts one hindcast job DETACHED from the calling session (via WMI Win32_Process.Create, so
# the process is not in the caller's job object and survives the end of a Claude Code / terminal session).
# Measured 19.09.: every background pull died with the interrupted session at 09:17 UTC ("fork: retry").
#
#   powershell -File scripts/hindcast/detach.ps1 -Name full-dyn -Shell cmd -Command 'node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/hindcast/queue.mjs dyn'
#   powershell -File scripts/hindcast/detach.ps1 -Name data-run-A2 -Command 'bash scripts/hindcast/pull-data-run.sh 2026-06-21 2026-07-25'
#
# -Shell cmd (preferred for long chains): cmd.exe redirects, no Git Bash in the chain - Bash chains died silently
#   under load on 19.09. (Cygwin fork); queue.mjs writes its own START/DONE lines.
# -Shell bash: Git Bash -lc with START/EXIT lines around the command.
# stdout+stderr go to <HINDCAST_ROOT>\log\pull-<Name>.log (appended); the PID lands in log\pids.jsonl.
# Stop all jobs:  Get-CimInstance Win32_Process | ? { $_.CommandLine -like '*hindcast*' } | % { Stop-Process -Id $_.ProcessId }
param(
  [Parameter(Mandatory = $true)][string]$Name,
  [Parameter(Mandatory = $true)][string]$Command,
  [string]$Root = 'C:\dev\buscosun-hindcast',
  [string]$Cwd = 'C:\dev\buscosun-web',
  [ValidateSet('bash', 'cmd')][string]$Shell = 'bash',
  # BelowNormal leaves the 4 cores to interactive work; children (python per model/day) inherit the class
  [ValidateSet('Normal', 'BelowNormal', 'Idle')][string]$Priority = 'BelowNormal'
)
$logWin = Join-Path $Root "log\pull-$Name.log"
if ($Shell -eq 'cmd') {
  $cmd = "cmd.exe /d /c `"cd /d $Cwd && $Command >> `"$logWin`" 2>&1`""
  $logShown = $logWin
} else {
  $bash = 'C:\Program Files\Git\bin\bash.exe'
  $logUnix = '/' + ($Root -replace ':', '' -replace '\\', '/').Substring(0, 1).ToLower() + ($Root -replace ':', '' -replace '\\', '/').Substring(1) + "/log/pull-$Name.log"
  $inner = "cd '$($Cwd -replace '\\', '/')' && { echo `"`$(date -u +%FT%TZ) START $Name`"; $Command; echo `"`$(date -u +%FT%TZ) EXIT `$?`"; } >> '$logUnix' 2>&1"
  $cmd = "`"$bash`" -lc `"$($inner -replace '"', '\"')`""
  $logShown = $logUnix
}
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd; CurrentDirectory = $Cwd }
if ($r.ReturnValue -eq 0 -and $Priority -ne 'Normal') { try { (Get-Process -Id $r.ProcessId -ErrorAction Stop).PriorityClass = $Priority } catch {} }
$line = [ordered]@{ at = (Get-Date).ToUniversalTime().ToString('o'); name = $Name; pid = $r.ProcessId; rc = $r.ReturnValue; shell = $Shell; command = $Command; log = $logShown } | ConvertTo-Json -Compress
Add-Content -Path (Join-Path $Root 'log\pids.jsonl') -Value $line -Encoding ascii
"$Name rc=$($r.ReturnValue) pid=$($r.ProcessId) log=$logShown"
