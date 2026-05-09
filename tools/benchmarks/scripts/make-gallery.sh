#!/usr/bin/env bash
# Generate a static HTML gallery of all PNG plots in <plots-dir>/png/.
# Groups figures by category (top-level vs phase-breakdown vs phase-progression).
# Open in a browser: `xdg-open <plots-dir>/index.html`

set -euo pipefail

PLOTS_DIR="${1:?Usage: $0 <plots-dir>}"
PLOTS_DIR="$(cd "$PLOTS_DIR" && pwd)"
PNG_DIR="$PLOTS_DIR/png"
OUT="$PLOTS_DIR/index.html"

if [[ ! -d "$PNG_DIR" ]]; then
  echo "$PNG_DIR does not exist" >&2
  exit 1
fi

emit_section() {
  local title="$1"
  shift
  local files=("$@")
  if (( ${#files[@]} == 0 )); then return; fi
  echo "<h2>$title</h2>"
  echo "<div class='grid'>"
  for f in "${files[@]}"; do
    local name="$(basename "$f" -1.png)"
    name="${name%-1}"
    echo "<figure><a href='png/$(basename "$f")' target='_blank'><img src='png/$(basename "$f")' loading='lazy'/></a><figcaption>$name</figcaption></figure>"
  done
  echo "</div>"
}

cd "$PNG_DIR"

cat > "$OUT" <<'HEAD'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Benchmark plots</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 1.5rem; background: #111; color: #eee; }
  h1 { font-size: 1.4rem; margin-bottom: 0.2rem; }
  h2 { font-size: 1.1rem; margin-top: 2rem; padding-bottom: 0.3rem; border-bottom: 1px solid #444; }
  .meta { color: #888; font-size: 0.85rem; margin-bottom: 1.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 1rem; }
  figure { margin: 0; background: #1a1a1a; border-radius: 4px; padding: 0.5rem; }
  figure img { width: 100%; height: auto; display: block; cursor: zoom-in; }
  figcaption { font-size: 0.8rem; color: #aaa; margin-top: 0.4rem; word-break: break-all; }
  a { color: #4af; }
  nav a { display: inline-block; margin-right: 1rem; }
</style>
</head>
<body>
<h1>Benchmark plots</h1>
HEAD

echo "<div class='meta'>Generated $(date -Iseconds) from $PLOTS_DIR</div>" >> "$OUT"
echo "<nav><a href='#main'>Main</a><a href='#progression'>Phase progression</a><a href='#breakdown'>Phase breakdown (per cell)</a><a href='#threading'>Threading</a><a href='#caching'>Caching</a></nav>" >> "$OUT"

# Top-level figures, grouped logically.
mapfile -t scaling_files < <(ls main-*-scaling*.png 2>/dev/null | sort)
mapfile -t speedup_files < <(ls main-*-speedup*.png 2>/dev/null | sort)
mapfile -t rendering_files < <(ls main-rendering*.png 2>/dev/null | sort)
mapfile -t threading_files < <(ls threading-*.png 2>/dev/null | sort)
mapfile -t caching_files < <(ls caching-*.png 2>/dev/null | sort)
mapfile -t progression_files < <(ls main-phase-progression-*.png 2>/dev/null | sort)
mapfile -t breakdown_files < <(ls main-phase-breakdown-*.png 2>/dev/null | sort)

{
  echo "<a id='main'></a>"
  emit_section "Scaling (total time vs. project size)" "${scaling_files[@]}"
  emit_section "Speedup vs. baseline" "${speedup_files[@]}"
  emit_section "Rendering pipeline" "${rendering_files[@]}"
  echo "<a id='progression'></a>"
  emit_section "Phase progression (per project × query)" "${progression_files[@]}"
  echo "<a id='breakdown'></a>"
  emit_section "Phase breakdown (per project × scale, tree query)" "${breakdown_files[@]}"
  echo "<a id='threading'></a>"
  emit_section "Threading" "${threading_files[@]}"
  echo "<a id='caching'></a>"
  emit_section "Caching" "${caching_files[@]}"
  echo "</body></html>"
} >> "$OUT"

echo "Wrote $OUT"

if [[ "${2:-}" == "--serve" ]]; then
  PORT="${3:-8765}"
  echo "Serving at http://localhost:$PORT/  (Ctrl-C to stop)"
  cd "$PLOTS_DIR" && exec python3 -m http.server "$PORT"
else
  echo "Open with: xdg-open $OUT"
  echo "(If you get ERR_FILE_NOT_FOUND in a Flatpak browser, re-run with: $0 $PLOTS_DIR --serve)"
fi
