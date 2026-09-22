#!/usr/bin/env bash
# pull-dynamical.sh — AP10a: dynamical.org archives month by month (resumable: every cached init/variable is skipped).
#   bash scripts/hindcast/pull-dynamical.sh <ds> <from YYYY-MM-DD> <to YYYY-MM-DD> [threads]
set -u
DS=${1:?ds}; FROM=${2:?from}; TO=${3:?to}; TH=${4:-4}
PY=${HINDCAST_PY:-/c/dev/buscosun-hindcast/.venv/Scripts/python.exe}
HERE=$(cd "$(dirname "$0")" && pwd)
export PYTHONIOENCODING=utf-8
d=$FROM
while [[ ! "$d" > "$TO" ]]; do
  e=$(date -u -d "$d + 1 month - 1 day" +%F); [[ "$e" > "$TO" ]] && e=$TO
  out=$("$PY" "$HERE/extract_dynamical.py" --ds "$DS" --from "$d" --to "$e" --threads "$TH" 2>&1 | grep -a '"kind": "summary"\|Error\|Traceback' | tail -2)
  echo "$(date -u +%FT%TZ) $DS $d..$e ${out:-nothing to read}"
  d=$(date -u -d "$e + 1 day" +%F)
done
echo "$(date -u +%FT%TZ) DONE $DS $FROM..$TO"
