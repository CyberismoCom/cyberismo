#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/run-all.sh <project-path> <output-dir>
PROJECT_PATH="${1:?Usage: $0 <project-path> <output-dir>}"
OUTPUT_DIR="${2:?Usage: $0 <project-path> <output-dir>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$BENCH_DIR/../.." && pwd)"
TSX="$ROOT_DIR/node_modules/.bin/tsx"

mkdir -p "$OUTPUT_DIR"

echo "=== Benchmark Suite ==="
echo "Project:    $PROJECT_PATH"
echo "Output dir: $OUTPUT_DIR"
echo ""

echo "--- bench-main (6 variants × 5+1 queries × 50 scales) ---"
"$TSX" "$BENCH_DIR/src/bench-main.ts" "$PROJECT_PATH" "$OUTPUT_DIR/main.json"

echo ""
echo "--- bench-caching (miss overhead + hit savings) ---"
"$TSX" "$BENCH_DIR/src/bench-caching.ts" "$PROJECT_PATH" "$OUTPUT_DIR/caching.json"

echo ""
echo "--- bench-threading (async vs sync at ~25k cards) ---"
UV_THREADPOOL_SIZE=16 "$TSX" "$BENCH_DIR/src/bench-threading.ts" "$PROJECT_PATH" "$OUTPUT_DIR/threading.json"

echo ""
echo "--- aggregate (JSON → combined CSV) ---"
"$TSX" "$BENCH_DIR/src/aggregate.ts" \
  --output "$OUTPUT_DIR/combined.csv" \
  "$OUTPUT_DIR/main.json" \
  "$OUTPUT_DIR/caching.json" \
  "$OUTPUT_DIR/threading.json"

echo ""
echo "=== Done. Results in $OUTPUT_DIR ==="
