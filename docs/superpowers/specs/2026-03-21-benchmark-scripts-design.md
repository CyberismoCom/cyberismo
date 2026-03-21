# Benchmark Scripts Design

## Context

The thesis evaluation chapter requires benchmark data for the following optimizations implemented in the `dippa` branch: native C++ addon vs binary Clingo, query language optimization (resultField), AST pre-parsing, caching, threading, and incremental grounding (pregrounding via gringo→ASPIF→clingo). All feature flags and support infrastructure are already implemented. This spec covers the remaining benchmark scripts needed to collect that data.

## Scope

**In scope:**
- `bench-main.ts` — scaling benchmark across 6 solver variants and 5 query targets
- `bench-caching.ts` — cache overhead and hit savings measurements
- `bench-threading.ts` — async vs sync throughput under concurrent load
- `scripts/run-all.sh` — bash orchestrator
- `baselines/pre-resultfield/` — complete LP snapshot for old query language variants

**Out of scope:** HEX-like proof of concept, thesis writing.

## Test Project

**Project:** `module-eu-cra` (at `module-eu-cra/` submodule path)

**Scaling template:** `project` (eucra/cardTypes/project, 33 cards per instantiation)

**Scale range:** 1,000 to 50,000 cards in 1,000-card steps (50 data points per variant/query combination)

**Runs per data point:** 10 measured runs. For addon variants, run 3 warm-up solves once before the measurement loop begins (not repeated at each scale step).

**Card selection:** Determined dynamically after the first template instantiation by cardType, not by hardcoded key (keys are generated fresh on creation). The script selects:

| Role | CardType | Character |
|---|---|---|
| leaf-task | `base/cardTypes/annualTask` | Any leaf annual task — empty adoc, no macros, no calculated fields |
| phase | `eucra/cardTypes/phase` | Phase card — parent of multiple tasks, empty adoc |
| risk-task | `base/cardTypes/quarterlyTask` | Unique quarterly task — `{{#graph}}` + `{{#createCards}}` + `{{#report}}` |
| project-root | `eucra/cardTypes/project` | Root card — `{{#report}}` × 2, ismsa field types |

## Benchmark 1: Main Scaling (`bench-main.ts`)

### Variants

| Variant | Method | Query language | Pre-parsing |
|---|---|---|---|
| `baseline` | clingo binary | old (pre-resultField) | — |
| `baseline+resultfield` | clingo binary | current | — |
| `c-api` | native addon | old | off (`setPreParsing(false)`) |
| `c-api+resultfield` | native addon | current | off |
| `c-api+aspif` | native addon — internal AST pre-parsing | current | on (default) |
| `incremental` | gringo→ASPIF→clingo binaries | current | — |

`c-api+aspif` uses the native addon's `setPreParsing(true)` flag, which pre-parses LP text into AST nodes at `setProgram` time. `incremental` is a completely different path: it shells out to the `gringo` binary to preground the base program to ASPIF format, then feeds that ASPIF file plus the query to the `clingo` binary — no native addon involved.

For `incremental`: base program = all programs in `['all']` category (cards + base.lp + calculations) built via `buildProgram('', ['all'])`; query = queryLanguage.lp content + specific query. The base is fed to `gringo --output=smodels`, producing an ASPIF file. The ASPIF file and the query are then passed to `clingo`. queryLanguage.lp and the query stay out of the gringo phase entirely.

For `baseline` and `c-api`: use LP files from `baselines/pre-resultfield/` (queryLanguage.lp, utils.lp, card.lp) extracted from `cfeabe13~1`.

### Query Targets

Each variant is run against all five query targets at every card scale:

1. **tree** — `tree.lp` against the whole project (unchanged between old/new query language)
2. **card-leaf-task** — `card.lp` against the leaf annual task card
3. **card-phase** — `card.lp` against the verification phase card
4. **card-risk** — `card.lp` against the quarterly risk task card (most calculated fields)
5. **card-root** — `card.lp` against the project root card

**Rendering query** (evaluateMacros): Run `evaluateMacros()` on the risk-task card (richest macro evaluation — `{{#graph}}` + `{{#createCards}}` + `{{#report}}`). Only tested against `c-api` and `c-api+aspif` variants (old-query-language variants cannot be injected into the evaluateMacros pipeline). The `baseline+resultfield` variant's wall-clock time (from `solveBinary`) is recorded alongside as a reference point. Counts as a 6th query target for those three variants.

### Output Schema

JSON per run. The existing `BenchmarkRun` type needs one new field — `query` — to carry the query target name. Fields map as follows:

| Field | Value |
|---|---|
| `method` | `'binary'` \| `'native'` \| `'pregrounding'` |
| `variant` | solver variant name (`baseline`, `c-api+aspif`, `incremental`, etc.) |
| `feature` | `'main-scaling'` |
| `query` | query target name (`tree`, `card-leaf-task`, `card-phase`, `card-risk`, `card-root`, `rendering`) |
| `cardCount` | current scale |
| timing fields | as defined in existing `BenchmarkRun` |

`BenchmarkRun` in `types.ts` must be extended with `query: string`.

## Benchmark 2: Caching (`bench-caching.ts`)

### Measurements

**Miss overhead** — compare `glue` timing (hash computation + cache lookup) with `setCacheEnabled(true)` vs `setCacheEnabled(false)`. Same program, same solve path. Shows that cache lookup on miss is negligible relative to add+ground+solve.

**Hit savings** — run the same query twice back-to-back with caching enabled. First run = miss (add+ground+solve > 0), second run = hit (add+ground+solve = 0). Report ratio of miss time to hit time.

Both measurements use the `tree.lp` query across the full 1,000–50,000 card scale range.

### Output

JSON per run. Output fields: `method: 'native'`, `variant: 'cache-enabled' | 'cache-disabled'`, `feature: 'caching'`. No `query` field needed (tree query only).

## Benchmark 3: Threading (`bench-threading.ts`)

### Method

`Promise.all()` of N=8 concurrent `solve()` calls against the same program.

**Variants:**
- `async` — default, worker thread pool
- `sync` — `setAsyncSolve(false)`, blocks the event loop

**Metric:** total wall-clock time for all 8 solves to complete (solves/second).

**Scale:** Fixed at ~25,000 cards (midpoint of the scale range). Threading behaviour is independent of program size; the goal is to measure concurrency characteristics, not scaling.

### Output

JSON per run. Output fields: `method: 'native'`, `variant: 'async' | 'sync'`, `feature: 'threading'`.

## Bash Orchestrator (`scripts/run-all.sh`)

Single entry point. Usage:

```bash
./scripts/run-all.sh <project-path> <output-dir>
```

Calls the three scripts in sequence, writing results to `<output-dir>/`:

```
bench-main.ts      → <output-dir>/main.json
bench-caching.ts   → <output-dir>/caching.json
bench-threading.ts → <output-dir>/threading.json
aggregate.ts       → <output-dir>/combined.csv  (+ summary to stdout)
```

Note: the existing `aggregate.ts` hardcodes its output path. It must be updated to accept an output directory argument (or an explicit output path) before the orchestrator can write to `<output-dir>/combined.csv`.

## Baseline LP Snapshot (`baselines/pre-resultfield/`)

Extract the following files from commit `cfeabe13~1` into `baselines/pre-resultfield/`:

- `queryLanguage.lp` — pre-resultField query language
- `utils.lp` — pre-resultField utils (significantly different from current)
- `card.lp` — pre-resultField card query

`tree.lp` was not changed by `cfeabe13` and does not need a baseline copy.

The existing `baselines/queryLanguage-pre-resultField.lp` is superseded by this directory.

## Files to Create

- `tools/benchmarks/src/bench-main.ts`
- `tools/benchmarks/src/bench-caching.ts`
- `tools/benchmarks/src/bench-threading.ts`
- `tools/benchmarks/scripts/run-all.sh`
- `tools/benchmarks/baselines/pre-resultfield/queryLanguage.lp`
- `tools/benchmarks/baselines/pre-resultfield/utils.lp`
- `tools/benchmarks/baselines/pre-resultfield/card.lp`

## Files to Modify

- `tools/benchmarks/src/types.ts` — add `query?: string` field to `BenchmarkRun`
- `tools/benchmarks/src/utils.ts` — add `query` column to `toCsv()` header and row serializer
- `tools/benchmarks/src/aggregate.ts` — accept output directory/path argument instead of hardcoded `results-combined.csv`

## Files to Remove

- `tools/benchmarks/baselines/queryLanguage-pre-resultField.lp` (superseded by `pre-resultfield/` directory)
