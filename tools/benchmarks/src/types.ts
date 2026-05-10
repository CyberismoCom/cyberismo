export interface BenchmarkRun {
  method: string;
  feature: string;
  variant: string;
  query?: string; // query target name (e.g. 'tree', 'card-leaf-task', 'rendering')
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
  clingoVariant?: string; // tags which clingo build produced the run; absent = "stock"
}

export interface BenchmarkConfig {
  projectPath: string;
  runs: number;
  warmupRuns: number;
  scales?: number[]; // card counts for scaling benchmarks
}

export interface CellTiming {
  project: string;
  scale: number;
  elapsedMs: number;
  completedAt: string; // ISO-8601
}

export interface BenchmarkResult {
  feature: string;
  config: BenchmarkConfig;
  runs: BenchmarkRun[];
  /** Per (project, scale) wall-clock so eta.sh can extrapolate. */
  cellTimings?: CellTiming[];
  timestamp: string;
  machine: string;
}

// ── Solver-stats benchmark ──────────────────────────────────────────────────
// Solver internals collected via `clingo --stats=2` for the QL-optimisation
// explanation in the thesis evaluation chapter §4. Schema is intentionally
// distinct from BenchmarkRun: no run repetitions (deterministic), no per-phase
// micro-timings, and the headline measurements are program-shape integers
// (rules / atoms / equivalences) rather than wall-clock samples.
export interface SolverStatsRun {
  feature: 'solver-stats';
  variant: 'baseline' | 'baseline+resultfield';
  project: string;
  cardCount: number;
  query: string; // 'tree' | 'card-leaf-task' | ...
  groundingTimeSec: number;
  solvingTimeSec: number;
  totalTimeSec: number;
  rules: number;
  bodies: number;
  atoms: number;
  equivalences: number;
  variables: number;
  constraints: number;
}

export interface SolverStatsResult {
  feature: 'solver-stats';
  config: { fixturesDir: string; scales: number[]; queries: string[] };
  runs: SolverStatsRun[];
  timestamp: string;
  machine: string;
}
