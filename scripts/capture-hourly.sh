#!/usr/bin/env bash
# Hourly fusion-fixture capture wrapper for cron (Linux/macOS). Windows uses
# scripts/capture-hourly.ps1 via Task Scheduler. Install with:
#   crontab -e   →   0 * * * * /abs/path/to/buscosun-web/scripts/capture-hourly.sh
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
mkdir -p fixtures
export NODE_NO_WARNINGS=1
stamp="$(date -Is)"
if node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/capture-fixture.mjs >> fixtures/capture.log 2>&1; then
  echo "$stamp OK" >> fixtures/capture.log
else
  echo "$stamp FAIL" >> fixtures/capture.log
  exit 1
fi
