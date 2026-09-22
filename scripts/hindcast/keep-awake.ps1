# keep-awake.ps1 - AP10a: holds off IDLE sleep while hindcast pulls run (python.exe from C:\dev\buscosun-hindcast\.venv).
# SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED) only for the lifetime of this process; the display may
# still turn off, a manual sleep / lid close still works. Exits (and releases the request) when no pull is left.
# Measured 19.09.: the machine slept 02:22-05:23 and 05:24-10:28 local time and the pulls stood still meanwhile.
Add-Type -Name Power -Namespace HC -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$ES_CONTINUOUS = [uint32]'0x80000000'; $ES_SYSTEM_REQUIRED = [uint32]'0x00000001'
$venv = 'C:\dev\buscosun-hindcast\.venv'
$idle = 0
while ($true) {
  $busy = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -like "$venv*" -or $_.CommandLine -like '*hindcast*' }).Count
  $busy += @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*hindcast*' }).Count
  if ($busy -gt 0) { $idle = 0; [void][HC.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED) }
  else { $idle++; if ($idle -ge 10) { break } }
  Start-Sleep -Seconds 60
}
[void][HC.Power]::SetThreadExecutionState($ES_CONTINUOUS)
"keep-awake: no hindcast process for 10 minutes, released $(Get-Date -Format o)"
