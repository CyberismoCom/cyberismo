# Thesis Evaluation Design

## Context

The master's thesis "Performant reasoning in declaratively extensible data architectures" documents the integration of Clingo ASP solver into the Cyberismo platform via a native C++ Node.js addon. Multiple optimizations were implemented over ~1 year across different schema versions and codebase states. The evaluation chapter needs benchmark data comparing each optimization against a fair baseline, plus solver statistics analysis and overall scaling measurements.

**Core challenge:** Features were implemented at different times with different schema versions. Historical checkout is impractical. Instead, we reproduce baselines within the current codebase using controlled approximations.

## Approach: "Reproduce in Current"

For each feature, create a controlled baseline within the current codebase that simulates "without this optimization." Same project content, same measurement harness, same hardware. Baselines are honest approximations — where they favor the baseline, this strengthens the argument.

## Branch Cleanup

The `dippa` branch has 7 commits on top of `main`. These need to be reorganized:

**Existing commits to keep (already clean):**

- `859ea8b1` C++ rewrite — major C++ layer cleanup (-563/+256 lines)
- `b53a364d` Multiple threads — async solve workers
- `f9093d60` Add logging — 6 lines of tracing
- `a70c011f` Compiler guard — 1-line platform guard fix

**WIP commit to split (`c53a13bc`):**

- Extract: **Mutex removal** from calculation-engine (replaces mutex with inlined context facts) → own commit
- Extract: **Misc cleanup** (unused import removal across files) → own commit
- Discard: CLI benchmark code (replaced by standalone scripts)

**ASPIF WIP commits to squash (`037d32ad`, `e3007fa8`):**

- Squash into single clean commit with feature flag for pre-parsing

## Implementation Priority Order

Commits ordered from most likely to merge into main → least likely:

### Tier 1: Mainline-Ready Features (enable evaluation)

These are clean, testable features that belong in the main codebase regardless of the thesis.

1. **Mutex removal** — Extract from WIP commit. Removes `async-mutex` from calculation-engine, inlines context facts into query string. Enabled by the threading work.
2. **Misc cleanup** — Extract from WIP commit. Removes unused imports across data-handler, backend, mcp.
3. **Caching bypass flag** — Add a flag to disable cache lookup in `solve()` / `solveWithBase()`. Small change to `binding.cc`.
4. **Threading configuration** — Add ability to configure thread pool size or fall back to synchronous solve.
5. **ASPIF pre-parsing flag** — Squash ASPIF WIP commits (`037d32ad`, `e3007fa8`) into a clean commit. Add flag to `setProgram` that prevents pre-parsing. Solver falls back to text parsing when disabled.

### Tier 2: Test-Focused Changes

6. **Tests for new flags** — Unit tests for caching bypass, threading config, and ASPIF pre-parsing flag.

### Tier 3: Evaluation-Specific Tooling (standalone scripts)

These are standalone benchmark scripts in `tools/benchmarks/`, not part of the CLI.

7. **Card scaler** — Script to scale projects to N cards using templates.
8. **Benchmark runner** — Core harness for running evaluation scenarios.
9. **Binary clingo baseline** — Wrapper for shelling out to `clingo` binary.
10. **Pregrounding runner** — Wrapper for `gringo` + `clingo` pipeline.
11. **Old query language baseline** — Pre-`resultField` version of `queryLanguage.lp`.
12. **Solver statistics runner** — `clingo --stats` parser.
13. **Results aggregator** — JSON → CSV + summary statistics.

## Per-Feature Evaluation Strategies

### 1. Native Addon vs. Binary Clingo

**Goal:** Measure overhead of the solve mechanism (excluding program generation).

- **Baseline:** Build the complete logic program string via `buildProgram()` JS API (`index.ts`), write to temp file, invoke `clingo` binary via `child_process.execFile()`, parse stdout. Each invocation is a cold start (process spawn + load + solve).
- **Treatment:** Same program string, solved via native addon's `solve()`.
- **Metrics:** Wall-clock time for solve only, plus addon's internal breakdown (glue/add/ground/solve).
- **Warm-up:** Addon gets 2-3 warm-up runs (JIT, memory allocation). Binary baseline does NOT get warm-up — each invocation is inherently a cold start, matching real-world usage. Process spawn overhead (5-15ms on Linux) is part of the binary baseline measurement.
- **Cache busting:** Call `clearCache()` between repetitions.
- **Note:** Single-file baseline is faster than the original multi-file approach — conservative comparison.

### 2. Query Language Optimization (resultField)

**Goal:** Measure impact of selective field projection on grounding and solve time.

- **Baseline:** Load the pre-`cfeabe13` (Sep 3, 2025) version of `queryLanguage.lp`. Strip `resultField` facts from generated program (stop emitting `resultField(...)` predicates). Old query language derives all fields through `showField`/`select`/`selectAll`.
- **Treatment:** Current `queryLanguage.lp` with `resultField` predicates.
- **Metrics:** Solve time, addon timing breakdown (add/ground/solve).
- **Implementation:** Store old `queryLanguage.lp` in benchmarks directory. Benchmark swaps both the LP file AND suppresses `resultField` fact generation. Verify answer set equivalence before measuring timing.
- **Cache busting:** Call `clearCache()` between repetitions.

### 3. Caching

**Goal:** Measure overhead of cache operations — demonstrate caching is "free" on miss.

- **Baseline:** Call `solve()` with cache bypass flag enabled.
- **Treatment:** Normal operation with LRU cache enabled.
- **Metrics:** Compare `glue` time on miss vs. total solve time. `glue` includes N-API argument parsing, program store lookup, hash computation (XXHash-64), and cache lookup. Show that this combined overhead is negligible relative to add+ground+solve cost.
- **Note:** Not measuring hit rates — measuring overhead. On cache hit, add+ground+solve are zero, proving ~100% savings when applicable.

### 4. Threading

**Goal:** Measure impact of async solving on throughput and event loop responsiveness.

- **Baseline:** Synchronous solve (single-threaded, blocks event loop) via threading config flag.
- **Treatment:** Async solve with thread pool.
- **Metrics:** Throughput (solves/second) with concurrent requests via `Promise.all()`, event loop latency during solves.
- **Event loop measurement:** Use a periodic `setImmediate()` probe that records timestamps. Gap between expected and actual callback times measures event loop blocking.

### 5. Pregrounding

**Goal:** Measure the benefit of separating grounding of the information model from query solving.

- **Baseline:** Full `clingo` binary invocation (ground + solve in one step) with the complete program.
- **Treatment:** Use the calculation engine's `generate()` to produce the base program (information model + calculation rules) WITHOUT queryLanguage.lp or query files. Preground this base with `gringo` (outputs ASPIF). Then feed ASPIF + query (queryLanguage.lp + specific query) to `clingo` binary.
- **Metrics:** Time for gringo pregrounding of base, time for clingo solve with ASPIF + query, total time. Compare against full clingo time. Demonstrates that base grounding can be amortized across multiple queries.
- **Method:** Run via CLI binaries (`gringo`, `clingo`), not the native addon.

### 6. ASPIF Pre-Parsing

**Goal:** Measure the benefit of pre-parsing LP text into AST/ASPIF at program registration time vs parsing at solve time.

- **Baseline:** Pre-parsing disabled via feature flag — `setProgram` stores raw LP text, parsing happens fresh at each `solve()` call (in the `add` phase).
- **Treatment:** Pre-parsing enabled — `setProgram` parses LP text into AST/ASPIF immediately, `solve()` uses pre-parsed form (skips parsing in `add` phase).
- **Metrics:** Addon timing breakdown, focusing on `add` time (which includes parsing). Treatment should show reduced `add` time since parsing was done upfront.
- **Implementation:** Feature flag in `setProgram` that prevents pre-parsing when disabled. The solver already falls back to text parsing when pre-parsed form isn't available.

### 7. Overall Performance (Scaling)

**Goal:** Characterize how the full system scales with project size.

- **Protocol:** For each of 3 real Cyberismo projects, generate versions with increasing card counts starting from 1000, stepping by 1000 (1000, 2000, 3000, ...) using project templates. Card tree structure from templates is preserved proportionally. Run full calculation pipeline. Average over 10 runs. Stop when average exceeds 5 seconds.
- **Projects:** cyberismo-docs (content-heavy), module-isms-essentials (many calculations), module-secure-development-essentials (most calculations).
- **Machines:** Both Machine A (AMD Ryzen 9800X3D desktop) and Machine B (Intel Ultra 7 155U laptop).

### 8. Solver Statistics

**Goal:** Descriptive analysis of internal Clingo metrics.

- **Method:** Run programs through `clingo --stats` binary. Parse statistics output.
- **Metrics:** Grounding time vs. solving time, ground rule count, rules optimized as equivalent.
- **No baseline comparison** — purely descriptive.

## Tooling Components

### Component 1: Card Scaler (`tools/benchmarks/card-scaler.ts`)

Takes a Cyberismo project and scales it to N cards using the project's templates.

- Input: project path, target card count, template to use
- Output: temporary copy of the project with N cards
- Uses `@cyberismo/data-handler` API to create cards programmatically

### Component 2: Benchmark Runner (`tools/benchmarks/runner.ts`)

Core harness that runs evaluation scenarios.

- Loads a (scaled) project via the calculation engine
- Runs treatment and baseline paths
- Collects native addon timing stats (glue/add/ground/solve/cacheHit)
- Handles warm-up runs, repetitions, statistical aggregation (mean, median, stddev)
- Outputs JSON with all raw timing data

### Component 3: Binary Clingo Baseline (`tools/benchmarks/binary-baseline.ts`)

Thin wrapper for native-vs-binary and pregrounding comparisons.

- Takes built program string from `buildProgram()` API
- Writes to temp file
- Invokes `clingo` binary via `child_process.execFile()`
- Parses stdout for results and timing
- Also supports `gringo` invocation for pregrounding (output ASPIF → pipe to `clingo`)

### Component 4: Old Query Language Loader (`tools/benchmarks/baselines/`)

Stores pre-`resultField` `queryLanguage.lp` (from before commit `cfeabe13`).

- Provides function to swap old LP file in for resultField evaluation

### Component 5: Solver Statistics Runner (`tools/benchmarks/solver-stats.ts`)

Separate script for Clingo statistics analysis.

- Takes built program, runs through `clingo --stats`
- Parses statistics output (grounding time, rule counts, equivalences)

### Component 6: Results Aggregator (`tools/benchmarks/aggregate.ts`)

Processes JSON output from benchmark runs.

- Computes summary statistics
- Outputs CSV for external charting
- Optionally generates basic charts

## Key Files (Existing)

- `tools/data-handler/src/containers/project/calculation-engine.ts` — orchestrates ASP logic, entry point for benchmarks
- `tools/node-clingo/lib/index.ts` — native addon JS API (solve, presolve, solveWithBase, buildProgram)
- `tools/node-clingo/src/clingo_solver.cc` — C++ solver with timing measurements (glue/add/ground/solve in μs)
- `tools/node-clingo/src/binding.cc` — N-API bindings, cache logic, entry point for flags
- `tools/assets/src/calculations/common/queryLanguage.lp` — current query language with resultField
- `tools/assets/src/calculations/common/base.lp` — core ASP rules
- `tools/assets/src/calculations/common/utils.lp` — utility predicates

## Test Environment

**Machine A (Desktop):** AMD Ryzen 7 9800X3D, 64 GB RAM, NVMe SSD
**Machine B (Laptop):** Intel Core Ultra 7 155U, 32 GB RAM, NVMe SSD
**Both:** Fedora 43, kernel 6.18.7, Node.js v22.22.1

**Benchmark hygiene:** Set CPU governor to `performance` to avoid frequency scaling. Minimize background processes. Report confidence intervals alongside mean/median/stddev.

## Output Format

- Raw data: JSON files per benchmark run
- Summary: CSV files for external plotting
- Charts: Generated separately (not tied to pgfplots yet)

## Verification

1. Run card scaler on a test project — verify cards are created correctly
2. Run each feature benchmark on a small project — verify baseline and treatment produce correct results (not just timing)
3. Compare native addon results with binary clingo results — verify identical answer sets
4. Run the full scaling benchmark on one project — verify the output JSON is well-formed and timing data is reasonable
5. Run solver statistics on a known program — verify parsed output matches `clingo --stats` output
6. Verify pregrounding: `gringo` ASPIF output + query fed to `clingo` produces same answer set as full `clingo` invocation
