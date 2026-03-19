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
