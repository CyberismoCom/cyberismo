#!/usr/bin/env bash
# Merge per-machine bench JSONs into canonical filenames for plotting.
#
# After every machine has finished `run-all.sh`, this script reads
# <feature>-<hostname>.json files in <output-dir> and concatenates their
# `runs[]` arrays into <output-dir>/<feature>.json. Per-machine identity is
# preserved on each row via the existing `machine` field, so plot.py's
# multi-machine grouping picks it up automatically.
#
# Usage: ./scripts/merge-machines.sh <output-dir>

set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 <output-dir>

Reads per-machine JSONs from <output-dir>:
  main-<host>.json caching-<host>.json threading-<host>.json solver-stats-<host>.json

Writes canonical merged JSONs to the same dir:
  main.json caching.json threading.json solver-stats.json

Each merged file keeps the union of runs[] across all machines. The
config/timestamp/machine top-level fields are taken from the first input
file with the per-machine list summarised under \`machines: [...]\`.

Requires jq.
EOF
}

if [[ $# -ne 1 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "merge-machines.sh: jq is required but not on PATH" >&2
  exit 1
fi

OUTPUT_DIR="$(cd "$1" && pwd)"

merge_feature() {
  local feature="$1"
  shopt -s nullglob
  local files=( "$OUTPUT_DIR/$feature"-*.json )
  shopt -u nullglob

  if (( ${#files[@]} == 0 )); then
    echo "  $feature: no per-machine files (skipped)"
    return 0
  fi

  local out="$OUTPUT_DIR/$feature.json"
  echo "  $feature: ${#files[@]} machine(s) -> $(basename "$out")"

  # jq slurp: read all per-machine JSONs into a top-level array, then build a
  # merged object. Top-level metadata (feature, config, timestamp) inherits
  # from the first file. `machines` lists the hostnames that contributed.
  jq -s '
    {
      feature: .[0].feature,
      config: .[0].config,
      runs: (map(.runs) | add),
      timestamp: .[0].timestamp,
      machine: "merged",
      machines: (map(.machine) | unique)
    }
  ' "${files[@]}" > "$out"

  local total
  total=$(jq '.runs | length' "$out")
  echo "    runs: $total"
}

echo "=== Merging per-machine results ==="
echo "Output dir: $OUTPUT_DIR"
echo ""

for feature in main caching threading solver-stats; do
  merge_feature "$feature"
done

echo ""
echo "=== Done ==="
echo "Plot with:"
echo "  python $(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")/plot.py all \"$OUTPUT_DIR\" <plots-out>"
