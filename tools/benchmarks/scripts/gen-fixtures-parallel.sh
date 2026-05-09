#!/usr/bin/env bash
# Generate Cyberismo benchmark fixtures in parallel.
#
# CommandManager.getInstance() is a Node singleton, so within a single process
# only one (project, scale) can be processed at a time. This script fans out
# across separate Node processes via xargs.

set -euo pipefail

usage() {
  cat <<EOF
Usage: $0 <fixtures-dir> [options]

Options:
  --scale-min N        First scale (default: 1000)
  --scale-max N        Last scale (default: 50000)
  --scale-step N       Step (default: 1000)
  --projects "a b"     Project names, space-separated
                       (default: cyberismo-docs module-eu-cra)
  --concurrency N      Parallel jobs (default: \$(nproc))
  -h, --help           Show this help

Projects must exist at <repo-root>/<project-name>/.

Example:
  $0 /tmp/fixtures --scale-min 200 --scale-max 5000 --concurrency 4
EOF
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

FIXTURES_DIR="$1"
shift

SCALE_MIN=1000
SCALE_MAX=50000
SCALE_STEP=1000
PROJECTS="cyberismo-docs module-eu-cra"
CONCURRENCY="$(nproc)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scale-min) SCALE_MIN="$2"; shift 2 ;;
    --scale-max) SCALE_MAX="$2"; shift 2 ;;
    --scale-step) SCALE_STEP="$2"; shift 2 ;;
    --projects) PROJECTS="$2"; shift 2 ;;
    --concurrency|-P) CONCURRENCY="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; usage >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
LOG_DIR="$(mktemp -d -t gen-fixtures-logs-XXXXXX)"

mkdir -p "$FIXTURES_DIR"
FIXTURES_DIR="$(cd "$FIXTURES_DIR" && pwd)"

echo "=== Parallel fixture generation ==="
echo "Repo root:    $ROOT_DIR"
echo "Fixtures dir: $FIXTURES_DIR"
echo "Projects:     $PROJECTS"
echo "Scales:       $SCALE_MIN .. $SCALE_MAX step $SCALE_STEP"
echo "Concurrency:  $CONCURRENCY"
echo "Logs:         $LOG_DIR"
echo ""

export ROOT_DIR FIXTURES_DIR LOG_DIR

{
  for proj in $PROJECTS; do
    for ((scale=SCALE_MIN; scale<=SCALE_MAX; scale+=SCALE_STEP)); do
      echo "$proj $scale"
    done
  done
} | xargs -P "$CONCURRENCY" -n 2 sh -c '
  proj="$1"; scale="$2"
  echo "[$(date +%H:%M:%S)] start  $proj scale=$scale"
  cd "$ROOT_DIR"
  if pnpm --filter @cyberismo/benchmarks bench:gen-fixtures "$FIXTURES_DIR" \
       --project "$proj" \
       --scale-min "$scale" --scale-max "$scale" --scale-step 1 \
       >"$LOG_DIR/$proj-$scale.log" 2>&1; then
    echo "[$(date +%H:%M:%S)] done   $proj scale=$scale"
  else
    echo "[$(date +%H:%M:%S)] FAIL   $proj scale=$scale (see $LOG_DIR/$proj-$scale.log)" >&2
    exit 1
  fi
' _

echo ""
echo "=== Done ==="
echo "Per-job logs preserved in $LOG_DIR"
