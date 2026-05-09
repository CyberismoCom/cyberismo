#!/usr/bin/env bash
# Estimate ETA for an in-flight benchmark using cellTimings + the fixture
# tree. Reads a partial JSON (main-*.json or caching-*.json), the source
# fixtures dir, and prints completed cells, mean per-card cost, and a
# linear extrapolation of remaining wall-clock.
#
# Usage: ./scripts/eta.sh <partial-json> <fixtures-dir>

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <partial-json> <fixtures-dir>" >&2
  exit 1
fi

JSON="$1"
FIXTURES="$2"

if ! command -v jq >/dev/null 2>&1; then
  echo "eta.sh: jq required" >&2
  exit 1
fi

if [[ ! -f "$JSON" ]]; then
  echo "eta.sh: $JSON not found" >&2
  exit 1
fi

# All (project, scale) cells configured by the fixture tree.
total_cells=$(find "$FIXTURES" -mindepth 2 -maxdepth 2 -type d | wc -l)

# Completed cells per cellTimings.
completed=$(jq -r '.cellTimings // [] | length' "$JSON")

if (( completed == 0 )); then
  echo "No cellTimings yet (bench may be still in its first cell)."
  echo "Total cells configured: $total_cells"
  exit 0
fi

# Sum elapsed and total card-seconds completed.
read -r sum_elapsed sum_cards <<<"$(jq -r '
  [.cellTimings[]] as $t |
  ($t | map(.elapsedMs) | add) as $e |
  ($t | map(.scale) | add) as $c |
  "\($e) \($c)"
' "$JSON")"

mean_per_cell_ms=$(awk -v e="$sum_elapsed" -v n="$completed" 'BEGIN{printf "%.0f", e/n}')
ms_per_card=$(awk -v e="$sum_elapsed" -v c="$sum_cards" 'BEGIN{ if (c>0) printf "%.3f", e/c; else print "n/a" }')

# Sum of remaining cells' card counts (from fixture meta.json).
remaining_cards=0
remaining_cells=0
while IFS= read -r meta; do
  proj=$(jq -r '.project' "$meta")
  scale=$(jq -r '.scale' "$meta")
  cards=$(jq -r '.cardCount' "$meta")
  done_p_s=$(jq -r --arg p "$proj" --argjson s "$scale" \
    '.cellTimings // [] | map(select(.project == $p and .scale == $s)) | length' "$JSON")
  if (( done_p_s == 0 )); then
    remaining_cards=$(( remaining_cards + cards ))
    remaining_cells=$(( remaining_cells + 1 ))
  fi
done < <(find "$FIXTURES" -mindepth 3 -maxdepth 3 -name 'meta.json')

eta_linear_s=$(awk -v r="$remaining_cards" -v rate="$ms_per_card" 'BEGIN{ if (rate=="n/a") print "n/a"; else printf "%.0f", (r*rate)/1000 }')
eta_uniform_s=$(awk -v rc="$remaining_cells" -v m="$mean_per_cell_ms" 'BEGIN{ printf "%.0f", (rc*m)/1000 }')

fmt_secs() {
  local s="$1"
  if [[ "$s" == "n/a" ]]; then echo "n/a"; return; fi
  printf "%02d:%02d:%02d" $((s/3600)) $(( (s%3600)/60 )) $((s%60))
}

echo "=== Bench ETA ==="
echo "JSON:           $JSON"
echo "Fixtures dir:   $FIXTURES"
echo ""
echo "Cells:          $completed completed / $total_cells configured ($((completed*100/total_cells))%)"
echo "Time elapsed:   $(fmt_secs $((sum_elapsed/1000)))"
echo "Mean per cell:  $(awk -v m="$mean_per_cell_ms" 'BEGIN{ printf "%.1fs", m/1000 }')"
echo "ms per card:    $ms_per_card"
echo ""
echo "Remaining:      $remaining_cells cells, $remaining_cards cards"
echo "ETA (linear):   $(fmt_secs $eta_linear_s)   # extrapolated by ms-per-card × remaining cards"
echo "ETA (uniform):  $(fmt_secs $eta_uniform_s)   # mean-cell × remaining cells"
