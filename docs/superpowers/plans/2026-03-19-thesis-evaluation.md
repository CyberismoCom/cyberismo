# Thesis Evaluation Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build feature flags, branch cleanup, and standalone benchmark scripts to produce evaluation data for the thesis on integrating Clingo ASP solver into Cyberismo.

**Architecture:** Feature flags are added to the node-clingo native addon (C++ + TS wrapper) to toggle caching, threading, and AST pre-parsing. Standalone benchmark scripts in a new `tools/benchmarks` workspace package use `@cyberismo/data-handler` and `@cyberismo/node-clingo` directly to run evaluations and produce JSON/CSV output.

**Tech Stack:** TypeScript, C++ (N-API/node-addon-api), Clingo C-API, Vitest, pnpm workspaces

**Spec:** `docs/superpowers/specs/2026-03-19-thesis-evaluation-design.md`

---

## Task 0: Branch Cleanup

Split the WIP commit and squash ASPIF commits into a clean linear history.

**Context:** The `dippa` branch has 7 commits. The WIP commit (`c53a13bc`) is a mixed bag that needs splitting. The ASPIF WIP commits (`037d32ad`, `e3007fa8`) should be squashed. We already restored the working tree to HEAD, so those ASPIF changes are already in the committed history — they just need squashing.

**Files:**

- Modify (via rebase): `tools/data-handler/src/containers/project/calculation-engine.ts`
- Modify (via rebase): `tools/data-handler/package.json`
- Modify (via rebase): various cleanup files across `tools/backend/`, `tools/data-handler/`, `tools/mcp/`

- [ ] **Step 1: Create a backup branch**

```bash
git branch dippa-backup
```

- [ ] **Step 2: Interactive rebase to reorganize commits**

We need to rewrite the history starting from the first dippa-only commit. The target ordering is:

1. `859ea8b1` C++ rewrite (keep as-is)
2. `b53a364d` Multiple threads (keep as-is)
3. `f9093d60` Add logging (keep as-is)
4. `a70c011f` Compiler guard (keep as-is)
5. (new) Mutex removal — extracted from `c53a13bc`
6. (new) Misc cleanup — extracted from `c53a13bc`
7. `037d32ad` + `e3007fa8` ASPIF — squashed into one commit

The simplest approach: soft-reset to the commit before WIP (`a70c011f`) and manually rebuild commits 5-7.

```bash
# Record the current HEAD for reference
git log --oneline -3

# Soft reset to the commit before WIP, keeping all changes staged
git reset --soft a70c011f
```

Now the working tree has ALL changes from commits 5-7 staged. We selectively commit them.

- [ ] **Step 3: Commit mutex removal**

Unstage everything, then stage only the mutex removal changes:

```bash
git reset HEAD .
```

Stage the calculation-engine.ts and package.json changes (mutex removal + context fact inlining):

```bash
git add tools/data-handler/src/containers/project/calculation-engine.ts
git add tools/data-handler/package.json
```

**Important:** Before committing, review the staged diff. The calculation-engine changes should ONLY contain:

- Removal of `import { Mutex } from 'async-mutex'`
- Removal of `private static mutex = new Mutex()`
- Removal of all `CalculationEngine.mutex.runExclusive()` wrappers
- Inlining context facts into query string in `run()` method
- Removal of `console.log('[clingo stats]', ...)` (this was debug logging in WIP — remove it)

The `console.log` line must NOT be committed — it was debug output from the WIP. Check with `git diff --cached` and remove it if present.

```bash
git commit -m "$(cat <<'EOF'
Remove mutex from calculation engine

The threading work makes the mutex unnecessary — the native addon
handles concurrency via async workers. Context facts are now inlined
into the query string to avoid race conditions where concurrent reads
could overwrite each other's 'context' program key in the store.

Also removes the async-mutex dependency from package.json.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Commit misc cleanup**

Stage the remaining cleanup changes from the WIP commit (unused import removal etc.):

```bash
git add tools/backend/src/domain/cards/lib.ts
git add tools/backend/src/domain/tree/service.ts
git add tools/data-handler/src/command-manager.ts
git add tools/data-handler/src/commands/export.ts
git add tools/data-handler/src/commands/rename.ts
git add tools/data-handler/src/commands/show.ts
git add tools/data-handler/src/permissions/action-guard.ts
git add tools/data-handler/test/command-rank.test.ts
git add tools/data-handler/test/command-remove.test.ts
git add tools/mcp/src/lib/render.ts
```

**Do NOT stage:** `tools/cli/src/index.ts`, `tools/cli/package.json`, `pnpm-lock.yaml`, `tools/data-handler/src/containers/project.ts` — these contain the CLI benchmark code and related changes that we're discarding.

```bash
git commit -m "$(cat <<'EOF'
Remove unused imports across packages

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Commit squashed ASPIF pre-parsing**

Stage the ASPIF changes (program_store and clingo_solver):

```bash
git add tools/node-clingo/src/program_store.h
git add tools/node-clingo/src/program_store.cc
git add tools/node-clingo/src/clingo_solver.cc
```

These changes add:

- `tryParseToAst()` function in program_store.cc
- `ast_nodes` field in `Program` struct
- Pre-parsing in `addProgram()` and `prepareQuery()`
- AST builder path in `ClingoSolver::solve()` (uses pre-parsed nodes when available, falls back to text parsing)

```bash
git commit -m "$(cat <<'EOF'
Add AST pre-parsing for logic programs

Programs are now parsed into AST nodes at registration time
(setProgram/prepareQuery) rather than at solve time. The solver
uses pre-parsed AST nodes when available and falls back to text
parsing when they're empty (e.g., if parsing failed silently).

This moves the parsing cost from the solve hot path to the
program registration path, which happens less frequently.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Discard remaining unstaged changes**

The remaining unstaged changes are the CLI benchmark code and related files we're not keeping. **Warning:** `git clean -fd` will delete ALL untracked files. Preserve `.gitmodules`, `masters-thesis/`, and `docs/` first:

```bash
# Discard modified tracked files
git checkout -- .

# Only clean the specific directories with leftover WIP files
git clean -fd -- tools/cli/ tools/data-handler/src/containers/project.ts
```

Verify that `.gitmodules`, `masters-thesis/`, and `docs/` are still present after cleanup.

- [ ] **Step 7: Verify the branch**

```bash
git log --oneline dippa --not main
```

Expected output (7 clean commits):

```
<hash> Add AST pre-parsing for logic programs
<hash> Remove unused imports across packages
<hash> Remove mutex from calculation engine
a70c011f Make function handler compiler guard explicit
f9093d60 Add logging to calculation engine
b53a364d Multiple threads
859ea8b1 C++ rewrite
```

- [ ] **Step 8: Build and test**

```bash
pnpm install && pnpm build && pnpm test
```

If tests fail, investigate. The mutex removal changes the concurrency model — ensure no tests depend on serial execution.

- [ ] **Step 9: Commit checkpoint — delete backup branch**

```bash
git branch -d dippa-backup
```

---

## Task 1: Caching Bypass Flag

**Files:**

- Modify: `tools/node-clingo/src/binding.cc:28-33` (add global flag)
- Modify: `tools/node-clingo/src/binding.cc:198-238` (check flag in Solve)
- Modify: `tools/node-clingo/src/binding.cc:261-276` (register new export)
- Modify: `tools/node-clingo/lib/index.ts:17-24` (add to ClingoBinding interface)
- Modify: `tools/node-clingo/lib/index.ts:151-167` (export new function)
- Test: `tools/node-clingo/test/solve.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tools/node-clingo/test/solve.test.ts` inside the main `describe`:

```typescript
describe('Cache bypass flag', () => {
  it('should skip cache when caching is disabled', async () => {
    const program = 'a. b. c(1). c(5).';

    // Enable caching (default)
    setCacheEnabled(true);
    const result1 = await solve(program);
    expect(result1.stats.cacheHit).toBe(false);

    // Second solve should hit cache
    const result2 = await solve(program);
    expect(result2.stats.cacheHit).toBe(true);

    // Disable caching
    setCacheEnabled(false);

    // Third solve should NOT hit cache even with same program
    const result3 = await solve(program);
    expect(result3.stats.cacheHit).toBe(false);
    expect(result3.stats.add).toBeGreaterThan(0);
    expect(result3.stats.ground).toBeGreaterThan(0);

    // Fourth solve should also miss (cache disabled)
    const result4 = await solve(program);
    expect(result4.stats.cacheHit).toBe(false);

    // Re-enable caching
    setCacheEnabled(true);
    clearCache();

    // Fifth solve: cache miss (just cleared), but now caching works again
    const result5 = await solve(program);
    expect(result5.stats.cacheHit).toBe(false);
    const result6 = await solve(program);
    expect(result6.stats.cacheHit).toBe(true);
  });
});
```

Also add `setCacheEnabled` to the import at the top of the test file.

**Important:** Add an `afterEach` inside the new `describe` block to restore defaults on test failure:

```typescript
afterEach(() => {
  setCacheEnabled(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/node-clingo && pnpm test
```

Expected: FAIL — `setCacheEnabled` is not exported.

- [ ] **Step 3: Add C++ implementation**

In `tools/node-clingo/src/binding.cc`, add the global flag **outside** the unnamed namespace (after the closing `}` on line 61, before the `SetProgram` function). It must have external linkage so `solve_async_worker.h` can `extern` it:

```cpp
bool g_cacheEnabled = true;
```

Add the SetCacheEnabled function (before `Init`):

```cpp
Napi::Value SetCacheEnabled(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBoolean())
    {
        throw Napi::TypeError::New(env, "Expected argument: enabled (boolean)");
    }
    g_cacheEnabled = info[0].As<Napi::Boolean>().Value();
    return env.Undefined();
}
```

In the `Solve` function, wrap the cache lookup (lines 216-229) with the flag check:

```cpp
// try to get the result from the cache
node_clingo::SolveResult result;
if (g_cacheEnabled && g_solveResultCache.result(query.hash, result))
{
    // ... existing cache hit code ...
}
```

In the `SolveAsyncWorker::OnOK()` in `solve_async_worker.h`, wrap the cache store with the flag. The worker stores to cache on line 92 (`m_cache.addResult(...)`). Pass the flag to the worker or check a global. Simplest: make `g_cacheEnabled` extern and check it in OnOK:

In `solve_async_worker.h`, before the `addResult` call:

```cpp
if (g_cacheEnabled)
{
    m_cache.addResult(m_query.hash, std::move(*m_result));
}
```

This requires declaring `g_cacheEnabled` as extern. In `binding.cc`, change to:

```cpp
bool g_cacheEnabled = true;
```

And add a declaration in `solve_async_worker.h` (or a shared header):

```cpp
extern bool g_cacheEnabled;
```

Register in `Init`:

```cpp
exports.Set(Napi::String::New(env, "setCacheEnabled"), Napi::Function::New(env, SetCacheEnabled));
```

- [ ] **Step 4: Add TypeScript wrapper**

In `tools/node-clingo/lib/index.ts`:

Add to `ClingoBinding` interface:

```typescript
setCacheEnabled(enabled: boolean): void;
```

Add function:

```typescript
function setCacheEnabled(enabled: boolean) {
  binding.setCacheEnabled(enabled);
}
```

Add to both exports:

```typescript
export {
  solve,
  setProgram,
  removeProgram,
  removeAllPrograms,
  clearCache,
  buildProgram,
  setCacheEnabled,
  ClingoResult,
};
export default {
  solve,
  setProgram,
  removeProgram,
  removeAllPrograms,
  clearCache,
  buildProgram,
  setCacheEnabled,
};
```

- [ ] **Step 5: Build and run tests**

```bash
cd tools/node-clingo && pnpm build && pnpm test
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add tools/node-clingo/src/binding.cc tools/node-clingo/src/solve_async_worker.h tools/node-clingo/lib/index.ts tools/node-clingo/test/solve.test.ts
git commit -m "$(cat <<'EOF'
Add caching bypass flag to node-clingo

Adds setCacheEnabled(bool) to toggle the solve result cache.
When disabled, solve() always runs the full pipeline and does
not store results. Useful for benchmarking and debugging.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Threading Configuration Flag

**Files:**

- Modify: `tools/node-clingo/src/binding.cc` (add sync solve path)
- Modify: `tools/node-clingo/src/solve_async_worker.h` (no changes needed — just skip it)
- Modify: `tools/node-clingo/lib/index.ts`
- Test: `tools/node-clingo/test/solve.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tools/node-clingo/test/solve.test.ts`:

```typescript
describe('Async solve flag', () => {
  it('should produce correct results in sync mode', async () => {
    setAsyncSolve(false);

    const program = 'a. b. c(1). c(6).';
    const result = await solve(program);

    expect(result.answers).toBeInstanceOf(Array);
    expect(result.answers.length).toBeGreaterThan(0);
    expect(result.answers[0]).toContain('a');
    expect(result.stats.add).toBeGreaterThanOrEqual(0);
    expect(result.stats.ground).toBeGreaterThanOrEqual(0);
    expect(result.stats.solve).toBeGreaterThanOrEqual(0);

    // Restore default
    setAsyncSolve(true);
  });

  it('should toggle between sync and async modes', async () => {
    const program = 'a. b. c(1). c(7).';

    // Async mode (default)
    setAsyncSolve(true);
    const asyncResult = await solve(program);
    expect(asyncResult.answers[0]).toContain('a');

    clearCache();

    // Sync mode
    setAsyncSolve(false);
    const syncResult = await solve(program);
    expect(syncResult.answers[0]).toContain('a');

    // Results should be equivalent
    expect(syncResult.answers).toEqual(asyncResult.answers);

    // Restore
    setAsyncSolve(true);
  });
});
```

Add `setAsyncSolve` to the import. Add `afterEach(() => { setAsyncSolve(true); })` to the describe block.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/node-clingo && pnpm test
```

Expected: FAIL — `setAsyncSolve` is not exported.

- [ ] **Step 3: Add C++ implementation**

In `tools/node-clingo/src/binding.cc`:

Add global flag next to `g_cacheEnabled` (outside the unnamed namespace):

```cpp
bool g_asyncSolve = true;
```

Add the N-API function:

```cpp
Napi::Value SetAsyncSolve(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBoolean())
    {
        throw Napi::TypeError::New(env, "Expected argument: enabled (boolean)");
    }
    g_asyncSolve = info[0].As<Napi::Boolean>().Value();
    return env.Undefined();
}
```

In the `Solve` function, after the cache check, add a sync path before the async worker dispatch:

```cpp
// Synchronous solve path (blocks event loop — for benchmarking only)
if (!g_asyncSolve)
{
    auto deferred = Napi::Promise::Deferred::New(env);
    try
    {
        node_clingo::ClingoSolver solver;
        auto solveResult = solver.solve(query);
        solveResult.stats.glue = std::chrono::duration_cast<std::chrono::microseconds>(t2 - t1);

        auto resultObj = node_clingo::create_napi_object_from_solve_result(env, solveResult);
        if (g_cacheEnabled)
        {
            g_solveResultCache.addResult(query.hash, std::move(solveResult));
        }
        deferred.Resolve(resultObj);
    }
    catch (const node_clingo::ClingoSolveException& e)
    {
        Napi::Error error = Napi::Error::New(env, e.what());
        Napi::Object errorObj = Napi::Object::New(env);
        node_clingo::NodeClingoLogs logs = node_clingo::parse_clingo_logs(env, e.logs);
        errorObj.Set("errors", logs.errors);
        errorObj.Set("warnings", logs.warnings);
        if (!e.programKey.empty())
        {
            errorObj.Set("program", Napi::String::New(env, e.programKey));
        }
        error.Set("details", errorObj);
        deferred.Reject(error.Value());
    }
    catch (const std::exception& e)
    {
        deferred.Reject(Napi::Error::New(env, e.what()).Value());
    }
    return deferred.Promise();
}

// Queue the expensive solve work on a worker thread (default async path)
auto* worker = new node_clingo::SolveAsyncWorker(env, std::move(query), t1, t2, g_solveResultCache);
```

Register in `Init`:

```cpp
exports.Set(Napi::String::New(env, "setAsyncSolve"), Napi::Function::New(env, SetAsyncSolve));
```

Also declare `g_asyncSolve` as extern in `solve_async_worker.h` (or a shared header — but since the sync path doesn't use the worker, it's only needed in `binding.cc`).

- [ ] **Step 4: Add TypeScript wrapper**

In `tools/node-clingo/lib/index.ts`:

Add to `ClingoBinding`:

```typescript
setAsyncSolve(enabled: boolean): void;
```

Add function:

```typescript
function setAsyncSolve(enabled: boolean) {
  binding.setAsyncSolve(enabled);
}
```

Add to exports.

- [ ] **Step 5: Build and run tests**

```bash
cd tools/node-clingo && pnpm build && pnpm test
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add tools/node-clingo/src/binding.cc tools/node-clingo/lib/index.ts tools/node-clingo/test/solve.test.ts
git commit -m "$(cat <<'EOF'
Add async solve toggle to node-clingo

Adds setAsyncSolve(bool) to switch between async worker threads
(default) and synchronous solving on the main thread. When disabled,
solve() blocks the event loop — intended for benchmarking the
threading optimization.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: ASPIF Pre-Parsing Flag

**Files:**

- Modify: `tools/node-clingo/src/program_store.cc:17-31` (conditional pre-parsing)
- Modify: `tools/node-clingo/src/program_store.h:63` (add flag)
- Modify: `tools/node-clingo/src/binding.cc` (add SetPreParsing function)
- Modify: `tools/node-clingo/lib/index.ts`
- Test: `tools/node-clingo/test/solve.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tools/node-clingo/test/solve.test.ts`:

```typescript
describe('Pre-parsing flag', () => {
  it('should produce correct results without pre-parsing', async () => {
    setPreParsing(false);
    removeAllPrograms();

    setProgram('base', 'fact(value).');
    const result = await solve('test :- fact(value).', ['base']);

    expect(result.answers[0]).toContain('test');
    expect(result.answers[0]).toContain('fact(value)');

    // Restore
    setPreParsing(true);
  });

  it('should produce identical results with and without pre-parsing', async () => {
    const baseContent = 'color(red). color(blue). shape(circle).';
    const query = 'valid :- color(X), shape(Y).';

    // With pre-parsing (default)
    setPreParsing(true);
    removeAllPrograms();
    clearCache();
    setProgram('base', baseContent);
    const withPreParse = await solve(query, ['base']);

    // Without pre-parsing
    setPreParsing(false);
    removeAllPrograms();
    clearCache();
    setProgram('base', baseContent);
    const withoutPreParse = await solve(query, ['base']);

    expect(withoutPreParse.answers).toEqual(withPreParse.answers);

    // Restore
    setPreParsing(true);
  });
});
```

Add `setPreParsing` to the import. Add `afterEach(() => { setPreParsing(true); })` to the describe block.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/node-clingo && pnpm test
```

Expected: FAIL — `setPreParsing` is not exported.

- [ ] **Step 3: Add C++ implementation**

In `tools/node-clingo/src/program_store.h`, add a public flag to `ProgramStore`:

```cpp
public:
    bool preParsing = true; // When false, skip AST pre-parsing
```

In `tools/node-clingo/src/program_store.cc`, modify `addProgram` to check the flag (line 73):

```cpp
auto ast = preParsing ? tryParseToAst(content) : std::vector<Clingo::AST::Node>{};
```

Also modify `prepareQuery` (line 155):

```cpp
auto ast = preParsing ? tryParseToAst(query) : std::vector<Clingo::AST::Node>{};
```

In `tools/node-clingo/src/binding.cc`, add the N-API function:

```cpp
Napi::Value SetPreParsing(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBoolean())
    {
        throw Napi::TypeError::New(env, "Expected argument: enabled (boolean)");
    }
    g_programStore.preParsing = info[0].As<Napi::Boolean>().Value();
    return env.Undefined();
}
```

Register in `Init`:

```cpp
exports.Set(Napi::String::New(env, "setPreParsing"), Napi::Function::New(env, SetPreParsing));
```

- [ ] **Step 4: Add TypeScript wrapper**

In `tools/node-clingo/lib/index.ts`:

Add to `ClingoBinding`:

```typescript
setPreParsing(enabled: boolean): void;
```

Add function:

```typescript
function setPreParsing(enabled: boolean) {
  binding.setPreParsing(enabled);
}
```

Add to exports.

- [ ] **Step 5: Build and run tests**

```bash
cd tools/node-clingo && pnpm build && pnpm test
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add tools/node-clingo/src/binding.cc tools/node-clingo/src/program_store.h tools/node-clingo/src/program_store.cc tools/node-clingo/lib/index.ts tools/node-clingo/test/solve.test.ts
git commit -m "$(cat <<'EOF'
Add pre-parsing toggle to node-clingo

Adds setPreParsing(bool) to control whether LP text is parsed into
AST nodes at setProgram time. When disabled, programs store raw text
and parsing happens at solve time (in the add phase). Enables
benchmarking the pre-parsing optimization.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Benchmark Package Setup

**Files:**

- Create: `tools/benchmarks/package.json`
- Create: `tools/benchmarks/tsconfig.json`
- Create: `tools/benchmarks/src/types.ts`
- Create: `tools/benchmarks/src/utils.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "dependencies": {
    "@cyberismo/data-handler": "workspace:*",
    "@cyberismo/node-clingo": "workspace:*",
    "@cyberismo/assets": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.8.0"
  },
  "name": "@cyberismo/benchmarks",
  "private": true,
  "scripts": {
    "build": "tsc",
    "bench:native-vs-binary": "tsx src/bench-native-vs-binary.ts",
    "bench:resultfield": "tsx src/bench-resultfield.ts",
    "bench:caching": "tsx src/bench-caching.ts",
    "bench:threading": "tsx src/bench-threading.ts",
    "bench:pregrounding": "tsx src/bench-pregrounding.ts",
    "bench:aspif": "tsx src/bench-aspif.ts",
    "bench:scaling": "tsx src/bench-scaling.ts",
    "bench:solver-stats": "tsx src/bench-solver-stats.ts"
  },
  "type": "module",
  "version": "0.0.1"
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create shared types**

Create `tools/benchmarks/src/types.ts`:

```typescript
export interface BenchmarkRun {
  method: string;
  feature: string;
  variant: string; // 'baseline' or 'treatment'
  project: string;
  cardCount: number;
  run: number;
  glueUs: number;
  addUs: number;
  groundUs: number;
  solveUs: number;
  totalUs: number;
  cacheHit: boolean;
  wallClockMs?: number; // for binary baseline
}

export interface BenchmarkConfig {
  projectPath: string;
  runs: number;
  warmupRuns: number;
  scales?: number[]; // card counts for scaling benchmarks
  template?: string; // template name for card scaling
}

export interface BenchmarkResult {
  feature: string;
  config: BenchmarkConfig;
  runs: BenchmarkRun[];
  timestamp: string;
  machine: string;
}
```

- [ ] **Step 4: Create shared utilities**

Create `tools/benchmarks/src/utils.ts`:

```typescript
import { hostname } from 'node:os';
import { writeFile } from 'node:fs/promises';
import type { BenchmarkResult, BenchmarkRun } from './types.js';

export function summarize(runs: BenchmarkRun[]): {
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
} {
  const values = runs.map((r) => r.totalUs);
  values.sort((a, b) => a - b);
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const median =
    n % 2 === 0
      ? (values[n / 2 - 1] + values[n / 2]) / 2
      : values[Math.floor(n / 2)];
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  const stddev = Math.sqrt(variance);
  const ci95 = (1.96 * stddev) / Math.sqrt(n);
  return { mean, median, stddev, min: values[0], max: values[n - 1], ci95 };
}

export async function writeResults(
  result: BenchmarkResult,
  outputPath: string,
): Promise<void> {
  await writeFile(outputPath, JSON.stringify(result, null, 2));
  console.error(`Results written to ${outputPath}`);
}

export function toCsv(runs: BenchmarkRun[]): string {
  const header =
    'method,feature,variant,project,cardCount,run,glueUs,addUs,groundUs,solveUs,totalUs,cacheHit,wallClockMs';
  const rows = runs.map(
    (r) =>
      `${r.method},${r.feature},${r.variant},${r.project},${r.cardCount},${r.run},${r.glueUs},${r.addUs},${r.groundUs},${r.solveUs},${r.totalUs},${r.cacheHit},${r.wallClockMs ?? ''}`,
  );
  return [header, ...rows].join('\n') + '\n';
}

export function machineName(): string {
  return hostname();
}
```

- [ ] **Step 5: Install dependencies**

```bash
pnpm install
```

- [ ] **Step 6: Build**

```bash
cd tools/benchmarks && pnpm build
```

Expected: compiles without errors.

- [ ] **Step 7: Commit**

```bash
git add tools/benchmarks/package.json tools/benchmarks/tsconfig.json tools/benchmarks/src/types.ts tools/benchmarks/src/utils.ts pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
Add benchmarks package scaffold

New workspace package @cyberismo/benchmarks with shared types
and utilities for thesis evaluation benchmarks.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Card Scaler

**Files:**

- Create: `tools/benchmarks/src/card-scaler.ts`

- [ ] **Step 1: Implement card scaler**

Create `tools/benchmarks/src/card-scaler.ts`:

```typescript
import { CommandManager } from '@cyberismo/data-handler';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Scales a project to a target card count by creating cards from a template.
 * Works on a temporary copy of the project.
 *
 * @param projectPath Path to the source project
 * @param targetCount Target number of cards
 * @param templateName Template to use for creating cards
 * @returns Path to the scaled temporary project (caller must clean up)
 */
export async function scaleProject(
  projectPath: string,
  targetCount: number,
  templateName: string,
): Promise<string> {
  // Copy project to temp directory
  const tmpDir = await mkdtemp(join(tmpdir(), 'cyberismo-bench-'));
  await cp(projectPath, tmpDir, { recursive: true });

  // Note: CommandManager.getInstance() is a singleton — calling it with a new
  // path disposes the previous instance. Only use the scaler before or after
  // benchmark runs, not during. If needed mid-benchmark, use the constructor directly.
  const commands = await CommandManager.getInstance(tmpDir);
  const initialCount = commands.project.cards().length;

  if (initialCount >= targetCount) {
    console.error(
      `Project already has ${initialCount} cards (target: ${targetCount})`,
    );
    return tmpDir;
  }

  // Create one instance to determine cards per template
  const testCards = await commands.createCmd.createCard(templateName);
  const cardsPerInstance = testCards.length;
  if (cardsPerInstance === 0) {
    await rm(tmpDir, { recursive: true, force: true });
    throw new Error(
      `Template '${templateName}' produces 0 cards — cannot scale`,
    );
  }

  let currentCount = initialCount + cardsPerInstance;
  console.error(
    `Template '${templateName}' produces ${cardsPerInstance} card(s). Initial: ${initialCount}, target: ${targetCount}`,
  );

  // Scale up
  while (currentCount < targetCount) {
    await commands.createCmd.createCard(templateName);
    currentCount += cardsPerInstance;
    if (currentCount % 500 === 0 || currentCount >= targetCount) {
      console.error(`  ${currentCount} / ${targetCount} cards`);
    }
  }

  console.error(`Scaled to ${currentCount} cards in ${tmpDir}`);
  return tmpDir;
}

/**
 * Cleans up a temporary scaled project directory
 */
export async function cleanupScaledProject(tmpDir: string): Promise<void> {
  await rm(tmpDir, { recursive: true, force: true });
}
```

- [ ] **Step 2: Build**

```bash
cd tools/benchmarks && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add tools/benchmarks/src/card-scaler.ts
git commit -m "$(cat <<'EOF'
Add card scaler for benchmark project scaling

Creates temporary copies of projects and scales them to target
card counts using project templates.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Binary Clingo Baseline

**Files:**

- Create: `tools/benchmarks/src/binary-baseline.ts`

- [ ] **Step 1: Implement binary baseline**

Create `tools/benchmarks/src/binary-baseline.ts`:

```typescript
import { execFile } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface BinaryResult {
  answers: string[];
  wallClockMs: number;
  groundMs?: number;
  solveMs?: number;
}

/**
 * Runs a logic program through the clingo binary.
 * Returns wall-clock time and optionally parsed solver stats.
 */
export async function solveBinary(
  program: string,
  useStats = false,
): Promise<BinaryResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'clingo-bench-'));
  const lpFile = join(tmpDir, 'program.lp');
  await writeFile(lpFile, program);

  const args = [lpFile];
  if (useStats) args.push('--stats');

  const start = performance.now();
  let stdout = '';

  try {
    const result = await execFileAsync('clingo', args);
    stdout = result.stdout;
  } catch (error: unknown) {
    // Clingo exits with code 10/20/30 for SAT/UNSAT/UNKNOWN — still valid
    if (error && typeof error === 'object' && 'stdout' in error) {
      stdout = (error as { stdout: string }).stdout;
    } else {
      await rm(tmpDir, { recursive: true, force: true });
      throw error;
    }
  }

  const wallClockMs = performance.now() - start;
  await rm(tmpDir, { recursive: true, force: true });

  // Parse answer sets from stdout
  const answers: string[] = [];
  const lines = stdout.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Answer:') && i + 1 < lines.length) {
      answers.push(lines[i + 1]);
    }
  }

  // Parse stats if requested
  let groundMs: number | undefined;
  let solveMs: number | undefined;
  if (useStats) {
    const groundMatch = stdout.match(/Grounding\s*:\s*([\d.]+)s/);
    const solveMatch = stdout.match(/Solving\s*:\s*([\d.]+)s/);
    if (groundMatch) groundMs = parseFloat(groundMatch[1]) * 1000;
    if (solveMatch) solveMs = parseFloat(solveMatch[1]) * 1000;
  }

  return { answers, wallClockMs, groundMs, solveMs };
}

/**
 * Pregrounding pipeline: gringo (base → ASPIF) → clingo (ASPIF + query)
 */
export async function solveWithPregrounding(
  baseProgram: string,
  queryProgram: string,
): Promise<{
  gringoMs: number;
  clingoMs: number;
  totalMs: number;
  answers: string[];
}> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'clingo-pregrind-'));
  const baseFile = join(tmpDir, 'base.lp');
  const aspifFile = join(tmpDir, 'base.aspif');
  const queryFile = join(tmpDir, 'query.lp');

  await writeFile(baseFile, baseProgram);
  await writeFile(queryFile, queryProgram);

  // Step 1: Preground base with gringo
  const gringoStart = performance.now();
  try {
    const gringoResult = await execFileAsync('gringo', [
      baseFile,
      '--output=smodels',
    ]);
    await writeFile(aspifFile, gringoResult.stdout);
  } catch (error: unknown) {
    await rm(tmpDir, { recursive: true, force: true });
    throw new Error(
      `gringo failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const gringoMs = performance.now() - gringoStart;

  // Step 2: Solve with clingo using ASPIF + query
  const clingoStart = performance.now();
  let stdout = '';
  try {
    const result = await execFileAsync('clingo', [aspifFile, queryFile]);
    stdout = result.stdout;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error) {
      stdout = (error as { stdout: string }).stdout;
    } else {
      await rm(tmpDir, { recursive: true, force: true });
      throw error;
    }
  }
  const clingoMs = performance.now() - clingoStart;

  await rm(tmpDir, { recursive: true, force: true });

  // Parse answers
  const answers: string[] = [];
  const lines = stdout.split('\n');
  for (const line of lines) {
    if (line.startsWith('Answer:')) {
      const idx = lines.indexOf(line);
      if (idx + 1 < lines.length) {
        answers.push(lines[idx + 1]);
      }
    }
  }

  return { gringoMs, clingoMs, totalMs: gringoMs + clingoMs, answers };
}
```

- [ ] **Step 2: Build**

```bash
cd tools/benchmarks && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add tools/benchmarks/src/binary-baseline.ts
git commit -m "$(cat <<'EOF'
Add binary clingo baseline and pregrounding runner

Wrappers for invoking clingo/gringo binaries for benchmark
comparisons. Includes pregrounding pipeline (gringo → ASPIF → clingo).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Old Query Language Baseline

**Files:**

- Create: `tools/benchmarks/baselines/queryLanguage-pre-resultField.lp`

- [ ] **Step 1: Extract the old queryLanguage.lp**

```bash
git show cfeabe13~1:tools/assets/src/calculations/common/queryLanguage.lp > tools/benchmarks/baselines/queryLanguage-pre-resultField.lp
```

- [ ] **Step 2: Verify the file**

The file should NOT contain any `resultField` references. Check:

```bash
grep -c "resultField" tools/benchmarks/baselines/queryLanguage-pre-resultField.lp
```

Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add tools/benchmarks/baselines/queryLanguage-pre-resultField.lp
git commit -m "$(cat <<'EOF'
Add pre-resultField query language baseline

Extracted from commit before cfeabe13 (Sep 3, 2025). Used for
benchmarking the resultField optimization impact.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Solver Statistics Runner

**Files:**

- Create: `tools/benchmarks/src/solver-stats.ts`

- [ ] **Step 1: Implement solver stats parser**

Create `tools/benchmarks/src/solver-stats.ts`:

```typescript
import { execFile } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SolverStatistics {
  groundingTimeSec: number;
  solvingTimeSec: number;
  totalTimeSec: number;
  rules: number;
  bodies: number;
  atoms: number;
  equivalences: number;
  variables: number;
  constraints: number;
  raw: string; // full stats output for manual inspection
}

/**
 * Runs a program through `clingo --stats=2` and parses the output.
 */
export async function collectSolverStats(
  program: string,
): Promise<SolverStatistics> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'clingo-stats-'));
  const lpFile = join(tmpDir, 'program.lp');
  await writeFile(lpFile, program);

  let stdout = '';
  try {
    const result = await execFileAsync('clingo', [lpFile, '--stats=2']);
    stdout = result.stdout;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'stdout' in error) {
      stdout = (error as { stdout: string }).stdout;
    } else {
      await rm(tmpDir, { recursive: true, force: true });
      throw error;
    }
  }

  await rm(tmpDir, { recursive: true, force: true });

  const parseFloat_ = (pattern: RegExp): number => {
    const match = stdout.match(pattern);
    return match ? parseFloat(match[1]) : 0;
  };

  const parseInt_ = (pattern: RegExp): number => {
    const match = stdout.match(pattern);
    return match ? parseInt(match[1], 10) : 0;
  };

  return {
    groundingTimeSec: parseFloat_(/Grounding\s*:\s*([\d.]+)s/),
    solvingTimeSec: parseFloat_(/Solving\s*:\s*([\d.]+)s/),
    totalTimeSec: parseFloat_(/Total\s*:\s*([\d.]+)s/),
    rules: parseInt_(/Rules\s*:\s*(\d+)/),
    bodies: parseInt_(/Bodies\s*:\s*(\d+)/),
    atoms: parseInt_(/Atoms\s*:\s*(\d+)/),
    equivalences: parseInt_(/Equivalences\s*:\s*(\d+)/),
    variables: parseInt_(/Variables\s*:\s*(\d+)/),
    constraints: parseInt_(/Constraints\s*:\s*(\d+)/),
    raw: stdout,
  };
}
```

- [ ] **Step 2: Build**

```bash
cd tools/benchmarks && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add tools/benchmarks/src/solver-stats.ts
git commit -m "$(cat <<'EOF'
Add solver statistics runner

Runs programs through clingo --stats=2 and parses grounding time,
solving time, rule counts, atoms, equivalences, etc.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Individual Benchmark Scripts

Each script is a standalone entry point. These will be implemented one at a time, building on the shared utilities.

**Files to create:**

- `tools/benchmarks/src/bench-native-vs-binary.ts`
- `tools/benchmarks/src/bench-resultfield.ts`
- `tools/benchmarks/src/bench-caching.ts`
- `tools/benchmarks/src/bench-threading.ts`
- `tools/benchmarks/src/bench-pregrounding.ts`
- `tools/benchmarks/src/bench-aspif.ts`
- `tools/benchmarks/src/bench-scaling.ts`
- `tools/benchmarks/src/bench-solver-stats.ts`

Each script follows the same pattern:

1. Parse CLI args (project path, output path, runs, etc.)
2. Set up the project (optionally scale)
3. Run baseline and treatment paths
4. Collect timing data
5. Write JSON output

**These scripts will be implemented iteratively based on which evaluation is needed first.** The exact implementation depends on the specific project structure and may need adjustment during testing. Implement one script, verify it works end-to-end on a real project, then proceed to the next.

- [ ] **Step 1: Implement `bench-native-vs-binary.ts`** (Feature 1 — most straightforward)

This is the first and simplest benchmark. It validates the entire pipeline works.

```typescript
// tools/benchmarks/src/bench-native-vs-binary.ts
import { CommandManager } from '@cyberismo/data-handler';
import {
  solve,
  buildProgram,
  clearCache,
  setCacheEnabled,
  setProgram,
  removeAllPrograms,
} from '@cyberismo/node-clingo';
import { lpFiles } from '@cyberismo/assets';
import { solveBinary } from './binary-baseline.js';
import { writeResults, machineName } from './utils.js';
import type { BenchmarkRun, BenchmarkResult } from './types.js';

const projectPath = process.argv[2];
const outputPath = process.argv[3] ?? 'results-native-vs-binary.json';
const runs = parseInt(process.argv[4] ?? '10', 10);
const warmupRuns = 3;

if (!projectPath) {
  console.error(
    'Usage: tsx src/bench-native-vs-binary.ts <project-path> [output-path] [runs]',
  );
  process.exit(1);
}

async function main() {
  const commands = await CommandManager.getInstance(projectPath);
  const engine = commands.calculateCmd;

  // Generate logic program
  await engine.generate();

  // Get the query program and build the full program
  const queryContent = lpFiles.queries.tree;
  const fullProgram = buildProgram(queryContent, ['all']);
  const cardCount = commands.project.cards().length;
  const benchRuns: BenchmarkRun[] = [];

  // Warm-up native addon
  setCacheEnabled(false);
  for (let i = 0; i < warmupRuns; i++) {
    await solve(queryContent, ['all']);
  }

  // Native addon benchmark
  for (let i = 1; i <= runs; i++) {
    clearCache();
    const result = await solve(queryContent, ['all']);
    const s = result.stats;
    benchRuns.push({
      method: 'native',
      feature: 'native-vs-binary',
      variant: 'treatment',
      project: commands.project.projectPrefix,
      cardCount,
      run: i,
      glueUs: s.glue,
      addUs: s.add,
      groundUs: s.ground,
      solveUs: s.solve,
      totalUs: s.glue + s.add + s.ground + s.solve,
      cacheHit: s.cacheHit,
    });
    console.error(`  native run ${i}/${runs}`);
  }

  // Binary clingo benchmark
  for (let i = 1; i <= runs; i++) {
    const result = await solveBinary(fullProgram, true);
    benchRuns.push({
      method: 'binary',
      feature: 'native-vs-binary',
      variant: 'baseline',
      project: commands.project.projectPrefix,
      cardCount,
      run: i,
      glueUs: 0,
      addUs: 0,
      groundUs: result.groundMs ? Math.round(result.groundMs * 1000) : 0,
      solveUs: result.solveMs ? Math.round(result.solveMs * 1000) : 0,
      totalUs: Math.round(result.wallClockMs * 1000),
      cacheHit: false,
      wallClockMs: result.wallClockMs,
    });
    console.error(`  binary run ${i}/${runs}`);
  }

  setCacheEnabled(true);

  const benchResult: BenchmarkResult = {
    feature: 'native-vs-binary',
    config: { projectPath, runs, warmupRuns },
    runs: benchRuns,
    timestamp: new Date().toISOString(),
    machine: machineName(),
  };

  await writeResults(benchResult, outputPath);
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
```

- [ ] **Step 2: Test on a real project**

```bash
cd tools/benchmarks && pnpm exec tsx src/bench-native-vs-binary.ts /path/to/a/cyberismo/project results-test.json 3
```

Verify the JSON output is well-formed and timing data looks reasonable.

- [ ] **Step 3: Commit**

```bash
git add tools/benchmarks/src/bench-native-vs-binary.ts
git commit -m "$(cat <<'EOF'
Add native-vs-binary benchmark script

Compares native addon solve() against clingo binary invocation
on the same program. First evaluation script.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Implement remaining benchmark scripts one at a time**

Each subsequent script follows the same pattern. Implement, test on a real project, commit. The scripts depend on:

| Script                  | Depends on                                   | Key feature flag       |
| ----------------------- | -------------------------------------------- | ---------------------- |
| `bench-caching.ts`      | `setCacheEnabled`                            | Tier 1 flag            |
| `bench-threading.ts`    | `setAsyncSolve`                              | Tier 1 flag            |
| `bench-aspif.ts`        | `setPreParsing`                              | Tier 1 flag            |
| `bench-resultfield.ts`  | `baselines/queryLanguage-pre-resultField.lp` | LP swap                |
| `bench-pregrounding.ts` | `solveWithPregrounding()`                    | gringo/clingo pipeline |
| `bench-scaling.ts`      | `scaleProject()`                             | card scaler            |
| `bench-solver-stats.ts` | `collectSolverStats()`                       | clingo --stats         |

Commit each separately with a descriptive message.

---

## Task 10: Results Aggregator

**Files:**

- Create: `tools/benchmarks/src/aggregate.ts`

- [ ] **Step 1: Implement aggregator**

Create `tools/benchmarks/src/aggregate.ts`:

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import { summarize, toCsv } from './utils.js';
import type { BenchmarkResult } from './types.js';

const inputPaths = process.argv.slice(2);

if (inputPaths.length === 0) {
  console.error(
    'Usage: tsx src/aggregate.ts <result1.json> [result2.json] ...',
  );
  process.exit(1);
}

async function main() {
  const allResults: BenchmarkResult[] = [];

  for (const path of inputPaths) {
    const content = await readFile(path, 'utf-8');
    allResults.push(JSON.parse(content) as BenchmarkResult);
  }

  // Print summary per feature/variant
  for (const result of allResults) {
    const byVariant = new Map<string, typeof result.runs>();
    for (const run of result.runs) {
      const key = `${run.method}:${run.variant}`;
      if (!byVariant.has(key)) byVariant.set(key, []);
      byVariant.get(key)!.push(run);
    }

    console.log(`\n=== ${result.feature} (${result.machine}) ===`);
    for (const [key, runs] of byVariant) {
      const stats = summarize(runs);
      console.log(
        `  ${key}: mean=${(stats.mean / 1000).toFixed(1)}ms median=${(stats.median / 1000).toFixed(1)}ms stddev=${(stats.stddev / 1000).toFixed(1)}ms (n=${runs.length})`,
      );
    }
  }

  // Write combined CSV
  const allRuns = allResults.flatMap((r) => r.runs);
  const csvPath = 'results-combined.csv';
  await writeFile(csvPath, toCsv(allRuns));
  console.error(`\nCSV written to ${csvPath}`);
}

main().catch((error) => {
  console.error('Aggregation failed:', error);
  process.exit(1);
});
```

- [ ] **Step 2: Build and test**

```bash
cd tools/benchmarks && pnpm build
```

Test with a result file from Task 9:

```bash
pnpm exec tsx src/aggregate.ts results-test.json
```

- [ ] **Step 3: Commit**

```bash
git add tools/benchmarks/src/aggregate.ts
git commit -m "$(cat <<'EOF'
Add results aggregator for benchmark output

Reads JSON result files, prints summary statistics, and outputs
combined CSV for external charting.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification

- [ ] **Full build**: `pnpm install && pnpm build`
- [ ] **All tests pass**: `pnpm test`
- [ ] **Run one end-to-end benchmark** on a real project to verify the pipeline works
- [ ] **Verify git log** shows clean, well-ordered commits with mainline-ready changes first
