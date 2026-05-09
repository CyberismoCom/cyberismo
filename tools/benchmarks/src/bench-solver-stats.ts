/**
 * Solver-stats benchmark — collects grounding-time program internals
 * (rules, bodies, atoms, equivalences, variables, constraints) from
 * `clingo --stats=2` for the QL-optimisation explanation in chapter §4.
 *
 * Unlike the wall-clock benchmarks, this measurement is deterministic — the
 * same logic program always grounds to the same program shape — so we collect
 * exactly one record per (project, scale, variant, query) cell.
 *
 * Reads pre-built LP files emitted by `generate-fixtures.ts`; does not
 * regenerate or modify the programs.
 *
 * CLI:
 *   tsx src/bench-solver-stats.ts <fixtures-dir> [output-path]
 *                                 [--scales 5000,25000] [--queries tree]
 */
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  listProjects,
  listScales,
  loadFixture,
  programPath,
} from './fixture-loader.js';
import { collectSolverStats } from './solver-stats.js';
import { machineName } from './utils.js';
import type { SolverStatsResult, SolverStatsRun } from './types.js';

// ── CLI parsing ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const positional: string[] = [];
let scalesArg: number[] = [5000, 25000];
let queriesArg: string[] = ['tree'];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--scales') {
    const next = args[++i];
    if (!next) {
      console.error('--scales requires a comma-separated list');
      process.exit(1);
    }
    scalesArg = next.split(',').map((s) => {
      const n = Number(s.trim());
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Invalid scale: ${s}`);
        process.exit(1);
      }
      return n;
    });
  } else if (a === '--queries') {
    const next = args[++i];
    if (!next) {
      console.error('--queries requires a comma-separated list');
      process.exit(1);
    }
    queriesArg = next
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } else if (a.startsWith('--')) {
    console.error(`Unknown flag: ${a}`);
    process.exit(1);
  } else {
    positional.push(a);
  }
}

const fixturesDir = positional[0];
const outputPath = positional[1] ?? 'results-solver-stats.json';

if (!fixturesDir) {
  console.error(
    'Usage: tsx src/bench-solver-stats.ts <fixtures-dir> [output-path] ' +
      '[--scales 5000,25000] [--queries tree]',
  );
  process.exit(1);
}

const VARIANTS = ['baseline', 'baseline+resultfield'] as const;

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const root = resolve(fixturesDir);
  const projects = await listProjects(root);
  if (projects.length === 0) {
    console.error(`No project directories found under ${root}.`);
    process.exit(1);
  }
  console.error(`Discovered projects: ${projects.join(', ')}`);
  console.error(`Scales:  ${scalesArg.join(', ')}`);
  console.error(`Queries: ${queriesArg.join(', ')}`);

  const allRuns: SolverStatsRun[] = [];

  for (const project of projects) {
    const availableScales = await listScales(root, project);
    const availableSet = new Set(availableScales);

    for (const scale of scalesArg) {
      if (!availableSet.has(scale)) {
        console.error(
          `WARNING: project '${project}' has no scale=${scale} fixture. Skipping.`,
        );
        continue;
      }

      const bundle = await loadFixture(root, project, scale);
      const cardCount = bundle.meta.cardCount;
      const projectId = bundle.meta.project;

      for (const variant of VARIANTS) {
        for (const query of queriesArg) {
          const lpPath = programPath(bundle, variant, query);
          if (!(await isFile(lpPath))) {
            console.error(
              `WARNING: missing program ${join(project, String(scale), 'programs', variant, `${query}.lp`)} — skipping.`,
            );
            continue;
          }
          console.error(
            `  project=${projectId} scale=${scale} variant=${variant} query=${query}`,
          );
          const program = await readFile(lpPath, 'utf-8');
          const stats = await collectSolverStats(program);
          allRuns.push({
            feature: 'solver-stats',
            variant,
            project: projectId,
            cardCount,
            query,
            groundingTimeSec: stats.groundingTimeSec,
            solvingTimeSec: stats.solvingTimeSec,
            totalTimeSec: stats.totalTimeSec,
            rules: stats.rules,
            bodies: stats.bodies,
            atoms: stats.atoms,
            equivalences: stats.equivalences,
            variables: stats.variables,
            constraints: stats.constraints,
          });
        }
      }
    }
  }

  const result: SolverStatsResult = {
    feature: 'solver-stats',
    config: {
      fixturesDir: root,
      scales: scalesArg,
      queries: queriesArg,
    },
    runs: allRuns,
    timestamp: new Date().toISOString(),
    machine: machineName(),
  };

  await writeFile(outputPath, JSON.stringify(result, null, 2));
  console.error(`\nDone. ${allRuns.length} record(s) written to ${outputPath}`);
}

main().catch((error) => {
  console.error('Solver-stats benchmark failed:', error);
  process.exit(1);
});
