# Benchmark plotting

`plot.py` consumes the JSON files written by the TypeScript benchmark scripts
in `tools/benchmarks/src/` and emits PDF figures for the thesis evaluation
chapter. It is intentionally separate from the rest of the monorepo: it is a
plain Python script with its own `requirements.txt` and is **not** wired into
`pnpm` / `package.json`.

## Install

The script targets Python 3.11+. A virtualenv is recommended:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r tools/benchmarks/scripts/requirements.txt
```

Dependencies:

- `matplotlib` (vector PDF output)
- `pandas` (DataFrame aggregation)
- `numpy` (statistics)
- `pytest` (smoke tests)

No `seaborn`, no `plotly` required.

PDF output works with no LaTeX engine. PGF output (see below) additionally
requires `lualatex` on `$PATH`; if it is missing the script prints a single
warning to stderr and writes only the PDFs.

## Running the benchmarks first

The plotting script does not run benchmarks; it only reads JSON. Generate the
input files via the TypeScript scripts (see `tools/benchmarks/scripts/run-all.sh`):

```bash
# from the repo root
pnpm -F @cyberismo/benchmarks build  # if benchmarks ever gets a build step
tsx tools/benchmarks/src/bench-caching.ts   <project-path> caching.json
tsx tools/benchmarks/src/bench-threading.ts <project-path> threading.json
tsx tools/benchmarks/src/bench-main.ts      <project-path> main.json
```

Move/copy `caching.json`, `threading.json`, `main.json` into a single results
directory.

## Generating figures

```bash
# all eight figures at once
python tools/benchmarks/scripts/plot.py all <results-dir> <output-dir>

# subsets
python tools/benchmarks/scripts/plot.py caching   <results-dir> <output-dir>
python tools/benchmarks/scripts/plot.py threading <results-dir> <output-dir>
python tools/benchmarks/scripts/plot.py main      <results-dir> <output-dir>
```

`<output-dir>` is created if it does not exist. The thesis writes its figures
to `<repo-root>/../images/eval/`, but that path is purely a CLI argument: the
plotting script never hardcodes paths outside the tool repo.

### Figure inventory (output filenames are exact)

| Filename                      | Source feature | Description                                        |
| ----------------------------- | -------------- | -------------------------------------------------- |
| `caching-scaling.pdf`         | `caching`      | Total time vs. card count, one panel per project   |
| `threading-batch.pdf`         | `threading`    | Grouped bars: batch wall-clock for sync/async      |
| `threading-latency.pdf`       | `threading`    | Box plot of per-solve totals (sync vs. async)      |
| `main-tree-scaling.pdf`       | `main-scaling` | Tree query, all six variants, per project          |
| `main-tree-speedup.pdf`       | `main-scaling` | Variant / baseline ratio for the tree query        |
| `main-phase-breakdown.pdf`    | `main-scaling` | Stacked glue / add / ground / solve at max scale   |
| `main-incremental-decomp.pdf` | `main-scaling` | Stacked gringoMs / clingoMs per scale, per project |
| `main-rendering.pdf`          | `main-scaling` | Rendering query for the three measured variants    |

All PDFs are vector, single-page, with stable colours per variant
(`VARIANT_COLOURS` at the top of `plot.py`). 1-σ shaded bands are computed
across the per-cell run repetitions on every line plot.

### PGF companions

Alongside each `<name>.pdf` the script also writes `<name>.pgf` so the
thesis can `\input{<name>.pgf}` for native font and size matching with the
surrounding LaTeX document. The PGF backend is configured for `lualatex`
(matching the TAU thesis class). If `lualatex` is not installed locally —
typical on minimal CI environments — the script prints a single warning to
stderr and skips PGF output for that invocation; PDFs are still written.

## Smoke test

The fixtures in `tools/benchmarks/scripts/test-fixtures/` are tiny synthetic
JSON files (3 runs per cell, 2 scales, 2 projects) that exercise every code
path in `plot.py`. They are **not** real measurements; they exist solely so
the test suite can verify that subcommands produce the expected PDFs without
needing to run the actual benchmarks.

Run the tests:

```bash
pytest tools/benchmarks/scripts/test_plot.py -v
```

Each test invokes `plot.py` as a subprocess against the fixtures and asserts
that every expected PDF exists, starts with `%PDF`, and is at least 1 KB.

## Solver-stats: out of scope for plot.py

The `pnpm bench:solver-stats` script (`tools/benchmarks/src/bench-solver-stats.ts`)
emits `solver-stats.json` containing per-(project, scale, variant, query)
program-shape statistics — rules, bodies, atoms, equivalences, variables,
constraints — together with the grounding / solving / total times reported by
`clingo --stats=2`. The schema is a `SolverStatsResult` (see
`tools/benchmarks/src/types.ts`) and is intentionally distinct from the
`BenchmarkResult` consumed by `plot.py`.

The chapter §4 supplementary table is rendered **by hand** from this JSON —
it is a small (≤ 8 rows) LaTeX table, not a figure, and is intentionally out
of scope for `plot.py`.

## Style notes

- Backend forced to `pdf` (vector). No PNG output. A `.pgf` companion is
  written for each figure via per-savefig backend selection; the global
  backend stays on `pdf`.
- Legends are placed below the figure so they cannot occlude data.
- Spines top/right removed; light dotted grid for readability.
- Same colour for the same variant in every figure (define a new entry in
  `VARIANT_COLOURS` if you add a variant).

## Troubleshooting

- **`ModuleNotFoundError: matplotlib`** — install `requirements.txt` (or
  activate your venv).
- **`error: <foo>.json not found` / `not valid JSON` / `has no 'runs' key`**
  — file-load failures are reported as a single one-line stderr message and
  exit code 2 (instead of a Python traceback). When running `all`, a single
  bad file only skips that feature; the others still render.
- **`SystemExit: <foo>.json contained no runs`** — the JSON file exists but
  its `runs` array is empty. Re-run the corresponding benchmark.
- **`warning: PGF output skipped because lualatex is not available`** —
  install `lualatex` (TeX Live's `texlive-luatex` package on Debian-family
  distros) if you want the `.pgf` companions. Otherwise the PDFs are still
  written and the warning is harmless.
- **All bars/lines cluster at zero** — likely caused by mixing `Us` and `Ms`
  values; inspect the JSON. The script only divides `totalUs` by 1000 for the
  y-axis, so if a benchmark wrote ms into `totalUs` the units will be wrong.
- **PDF lacks the expected number of project panels** — the panel count is
  driven by the distinct `project` values in the input JSON. Ensure each
  project's run was included.
- **`threading-batch.pdf` shows only one machine cluster** — this is correct
  behaviour when the input contains a single `machine` value. Hatched
  patterns appear once two machines are present.
