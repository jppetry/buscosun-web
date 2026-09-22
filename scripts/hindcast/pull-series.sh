#!/usr/bin/env bash
# pull-series.sh — AP10a: Open-Meteo day-0 time series (s3://openmeteo/data/<model>/<var>/chunk_<n>.om) for every
# model of the t1 day-0 pseudo-cube, over a date range. Resumable (complete chunk files are skipped; the chunk that
# still grows is re-read).
#
#   bash scripts/hindcast/pull-series.sh 2026-08-01 2026-09-19 [model …]
set -u
FROM=${1:?from}; TO=${2:?to}; shift 2
MODELS=${*:-dwd_icon_d2 dwd_icon_eu ecmwf_ifs025 ecmwf_aifs025_single meteoswiss_icon_ch1}
PY=${HINDCAST_PY:-/c/dev/buscosun-hindcast/.venv/Scripts/python.exe}
HERE=$(cd "$(dirname "$0")" && pwd)
export PYTHONIOENCODING=utf-8
for m in $MODELS; do
  out=$("$PY" "$HERE/extract_openmeteo.py" --model "$m" --route series --from "$FROM" --to "$TO" --workers "${WORKERS:-4}" --files "${FILES:-4}" 2>&1 | grep -a '"kind": "summary"' | tail -1)
  echo "$(date -u +%FT%TZ) $FROM..$TO $m ${out:-NO-SUMMARY}"
done
echo "$(date -u +%FT%TZ) DONE $FROM..$TO"
