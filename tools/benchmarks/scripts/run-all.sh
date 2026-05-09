#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/run-all.sh <fixtures-dir> <output-dir>
#
# Runs all benchmarks against pre-generated fixtures. Output filenames are
# suffixed with the machine's hostname so multiple machines can share an
# <output-dir> without overwriting each other. Run `merge-machines.sh` after
# all machines have finished to produce canonical filenames for plotting.
#
# Run `pnpm bench:gen-fixtures <fixtures-dir>` first if fixtures are missing.
# Threading needs scale=200 fixtures (use --scale-min 200 when generating).
FIXTURES_DIR="${1:?Usage: $0 <fixtures-dir> <output-dir>}"
OUTPUT_DIR="${2:?Usage: $0 <fixtures-dir> <output-dir>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$BENCH_DIR/../.." && pwd)"
TSX="$ROOT_DIR/node_modules/.bin/tsx"
HOST="$(hostname -s 2>/dev/null || hostname)"

if [[ ! -d "$FIXTURES_DIR" ]]; then
  echo "Fixtures directory does not exist: $FIXTURES_DIR" >&2
  echo "Generate fixtures first: pnpm bench:gen-fixtures $FIXTURES_DIR" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "=== Benchmark Suite ==="
echo "Fixtures dir: $FIXTURES_DIR"
echo "Output dir:   $OUTPUT_DIR"
echo "Machine tag:  $HOST"
echo ""
echo "Discovered fixtures:"
for proj_dir in "$FIXTURES_DIR"/*/; do
  [[ -d "$proj_dir" ]] || continue
  project="$(basename "$proj_dir")"
  scales=$(find "$proj_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | grep -E '^[0-9]+$' | sort -n | tr '\n' ' ')
  echo "  $project: ${scales:-<no scales>}"
done
echo ""

echo "--- bench-main (6 variants × queries × scales × projects) ---"
"$TSX" "$BENCH_DIR/src/bench-main.ts" "$FIXTURES_DIR" "$OUTPUT_DIR/main-$HOST.json"

echo ""
echo "--- bench-caching (cache-disabled, cache-miss, cache-hit) ---"
"$TSX" "$BENCH_DIR/src/bench-caching.ts" "$FIXTURES_DIR" "$OUTPUT_DIR/caching-$HOST.json"

echo ""
echo "--- bench-threading (async vs sync at scale=200) ---"
UV_THREADPOOL_SIZE=$(nproc) "$TSX" "$BENCH_DIR/src/bench-threading.ts" "$FIXTURES_DIR" "$OUTPUT_DIR/threading-$HOST.json"

echo ""
echo "--- bench-solver-stats (rules/atoms/equivalences for QL comparison) ---"
"$TSX" "$BENCH_DIR/src/bench-solver-stats.ts" "$FIXTURES_DIR" "$OUTPUT_DIR/solver-stats-$HOST.json"

echo ""
echo "=== Done on $HOST. Per-machine results in $OUTPUT_DIR ==="
echo "Next step (after all machines finished):"
echo "  $SCRIPT_DIR/merge-machines.sh $OUTPUT_DIR"
echo "Then:"
echo "  python $SCRIPT_DIR/plot.py all $OUTPUT_DIR <plots-out>"
