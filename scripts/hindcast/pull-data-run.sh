#!/usr/bin/env bash
# pull-data-run.sh — AP10a: Open-Meteo `data_run` (whole runs, retained ~3 months ⇒ EXPIRING) day by day, OLDEST
# day first, every model the hindcast carries. Resumable: every om file already in the cache is skipped (0 bytes).
#
#   bash scripts/hindcast/pull-data-run.sh 2026-06-16 2026-08-31 [model …]
#
# Log per model/day in <HINDCAST_ROOT>/log/om-run-*.jsonl, a one-line progress per day on stdout.
set -u
FROM=${1:?from}; TO=${2:?to}; shift 2
MODELS=${*:-dwd_icon_d2 dwd_icon_eu meteoswiss_icon_ch1 meteoswiss_icon_ch2 dwd_icon ecmwf_ifs025 ecmwf_aifs025_single}
PY=${HINDCAST_PY:-/c/dev/buscosun-hindcast/.venv/Scripts/python.exe}
HERE=$(cd "$(dirname "$0")" && pwd)
export PYTHONIOENCODING=utf-8
d=$FROM
while [[ ! "$d" > "$TO" ]]; do
  for m in $MODELS; do
    out=$("$PY" "$HERE/extract_openmeteo.py" --model "$m" --route run --from "$d" --to "$d" --workers "${WORKERS:-4}" --files "${FILES:-6}" 2>&1 | grep -a '"kind": "summary"' | tail -1)
    echo "$(date -u +%FT%TZ) $d $m ${out:-NO-SUMMARY}"
  done
  d=$(date -u -d "$d + 1 day" +%F)
done
echo "$(date -u +%FT%TZ) DONE $FROM..$TO"
