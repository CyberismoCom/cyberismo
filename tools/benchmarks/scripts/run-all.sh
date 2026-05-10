#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/run-all.sh <fixtures-dir> <output-dir> [variant-node-path] [variant-name]
#
# Runs all benchmarks against pre-generated fixtures. Output filenames are
# suffixed with the machine's hostname so multiple machines can share an
# <output-dir> without overwriting each other. Run `merge-machines.sh` after
# all machines have finished to produce canonical filenames for plotting.
#
# Run `make fixtures` first if fixtures are missing. Threading needs the
# small scales (10, 200) which are part of the default SCALES set.
#
# Threading is run twice when [variant-node-path] is given: once with the
# .node currently in tools/node-clingo/build/Release/ (tagged "stock"), then
# again at the very end after copying [variant-node-path] into that location
# (tagged with [variant-name], default "mutexfix"). The variant run is last
# because the variant build is more likely to crash than stock — putting it
# last ensures the variant-independent benchmarks (solver-stats, main, caching)
# always complete on the stock build. The .node is restored on exit.

FIXTURES_DIR="${1:?Usage: $0 <fixtures-dir> <output-dir> [variant-node-path] [variant-name]}"
OUTPUT_DIR="${2:?Usage: $0 <fixtures-dir> <output-dir> [variant-node-path] [variant-name]}"
VARIANT_NODE="${3:-}"
VARIANT_NAME="${4:-mutexfix}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$BENCH_DIR/../.." && pwd)"
TSX="$ROOT_DIR/node_modules/.bin/tsx"
HOST="$(hostname -s 2>/dev/null || hostname)"
CLINGO_NODE="$ROOT_DIR/tools/node-clingo/build/Release/node-clingo.node"

if [[ ! -d "$FIXTURES_DIR" ]]; then
  echo "Fixtures directory does not exist: $FIXTURES_DIR" >&2
  echo "Generate fixtures first: pnpm bench:gen-fixtures $FIXTURES_DIR" >&2
  exit 1
fi

if [[ -n "$VARIANT_NODE" && ! -f "$VARIANT_NODE" ]]; then
  echo "Variant .node not found: $VARIANT_NODE" >&2
  exit 1
fi

if [[ -n "$VARIANT_NODE" && ! -f "$CLINGO_NODE" ]]; then
  echo "Stock .node not found at $CLINGO_NODE — run pnpm build in tools/node-clingo first." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "=== Benchmark Suite ==="
echo "Fixtures dir: $FIXTURES_DIR"
echo "Output dir:   $OUTPUT_DIR"
echo "Machine tag:  $HOST"
if [[ -n "$VARIANT_NODE" ]]; then
  echo "Variants:     stock + $VARIANT_NAME ($VARIANT_NODE)"
else
  echo "Variants:     stock only (no [variant-node-path] given)"
fi
echo ""
echo "Discovered fixtures:"
for proj_dir in "$FIXTURES_DIR"/*/; do
  [[ -d "$proj_dir" ]] || continue
  project="$(basename "$proj_dir")"
  scales=$(find "$proj_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | grep -E '^[0-9]+$' | sort -n | tr '\n' ' ')
  echo "  $project: ${scales:-<no scales>}"
done
echo ""

# Back up the in-place .node and restore on exit so a mid-run failure can't
# leave the variant build masquerading as the stock one.
STOCK_BACKUP=""
restore_stock_node() {
  if [[ -n "$STOCK_BACKUP" && -f "$STOCK_BACKUP" ]]; then
    cp -f "$STOCK_BACKUP" "$CLINGO_NODE"
    rm -f "$STOCK_BACKUP"
  fi
}
trap restore_stock_node EXIT

# All stock-based runs first — the .node currently in place is treated as stock.
echo ""
echo "--- bench-threading (clingo=stock) ---"
"$TSX" "$BENCH_DIR/src/bench-threading.ts" "$FIXTURES_DIR" "$OUTPUT_DIR/threading-$HOST-stock.json" stock

echo ""
echo "--- bench-solver-stats (rules/atoms/equivalences for QL comparison) ---"
"$TSX" "$BENCH_DIR/src/bench-solver-stats.ts" "$FIXTURES_DIR" "$OUTPUT_DIR/solver-stats-$HOST.json"

echo "--- bench-main (6 variants × queries × scales × projects) ---"
"$TSX" "$BENCH_DIR/src/bench-main.ts" "$FIXTURES_DIR" "$OUTPUT_DIR/main-$HOST.json"

echo ""
echo "--- bench-caching (cache-disabled, cache-miss, cache-hit) ---"
"$TSX" "$BENCH_DIR/src/bench-caching.ts" "$FIXTURES_DIR" "$OUTPUT_DIR/caching-$HOST.json"

# Variant threading run last so the .node swap doesn't affect the others —
# and so a variant crash leaves all variant-independent results intact.
if [[ -n "$VARIANT_NODE" ]]; then
  STOCK_BACKUP="$(mktemp -t node-clingo-stock.XXXXXX.node)"
  cp -f "$CLINGO_NODE" "$STOCK_BACKUP"

  echo ""
  echo "--- swapping node-clingo .node to $VARIANT_NAME ---"
  cp -f "$VARIANT_NODE" "$CLINGO_NODE"

  echo ""
  echo "--- bench-threading (clingo=$VARIANT_NAME) ---"
  "$TSX" "$BENCH_DIR/src/bench-threading.ts" "$FIXTURES_DIR" "$OUTPUT_DIR/threading-$HOST-$VARIANT_NAME.json" "$VARIANT_NAME"
fi

echo ""
echo "=== Done on $HOST. Per-machine results in $OUTPUT_DIR ==="
echo "Next step (after all machines finished):"
echo "  $SCRIPT_DIR/merge-machines.sh $OUTPUT_DIR"
echo "Then:"
echo "  python $SCRIPT_DIR/plot.py all $OUTPUT_DIR <plots-out>"
