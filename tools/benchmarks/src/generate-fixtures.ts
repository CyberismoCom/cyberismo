/**
 * Benchmark fixture generator.
 *
 * Pre-computes everything benchmarks need so that, at measurement time, no
 * scaling, project loading, or program building has to happen on the hot path.
 *
 * For each (project, scale) pair we emit:
 *   - a self-contained scaled project tree under `project/`
 *   - per-variant, per-query full LP programs under `programs/<variant>/<query>.lp`
 *     (the FULL program text — query is concatenated in — so each variant×query
 *      gets its own file)
 *   - a gringo-prebuilt ASPIF base for the incremental variant
 *   - small JSON sidecars (`cards.json`, `queries.json`, `meta.json`)
 *
 * Output is portable: no absolute paths leak into emitted files. The generated
 * project tree must work on any machine without re-scaling.
 */
import { CommandManager } from '@cyberismo/data-handler';
import { lpFiles } from '@cyberismo/assets';
import { execFile } from 'node:child_process';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import Handlebars from 'handlebars';
import {
  scaleProject,
  fastScaleProject,
  cleanupScaledProject,
} from './card-scaler.js';
import {
  loadBaselineFiles,
  swapToOldQL,
  restoreCurrentQL,
  type BaselineFiles,
} from './baseline-ql.js';
import { groundToAspif } from './gringo.js';

const execFileAsync = promisify(execFile);

// ── Project configuration ───────────────────────────────────────────────────
// Card-type slot semantics (taken from bench-main.ts):
//   leafTask    — small, deeply nested task card; expected populous
//   phase       — a phase/page card (used by tree-shaped queries)
//   riskTask    — a card with non-trivial content; doubles as the
//                 rendering reference card
//   projectRoot — the project root card type
//
// For projects without all four meaningful slots, leave the slot undefined and
// the generator skips emitting files / json entries for that slot.
interface ProjectConfig {
  /** Fixture directory name. */
  name: string;
  /** Path to the source project, relative to the repo root. */
  sourcePath: string;
  /** Template name passed to scaleProject(). */
  template: string;
  /** Card-type slot mapping. Undefined slots are skipped. */
  cardTypes: {
    leafTask?: string;
    phase?: string;
    riskTask?: string;
    projectRoot?: string;
  };
}

const PROJECTS: ProjectConfig[] = [
  {
    name: 'cyberismo-docs',
    sourcePath: 'cyberismo-docs',
    template: 'base/templates/page',
    cardTypes: {
      // cyberismo-docs is content-only. The `base/templates/page` template
      // produces a single `base/cardTypes/page` card per instance, so only the
      // leafTask slot is meaningful.
      leafTask: 'base/cardTypes/page',
    },
  },
  {
    name: 'module-eu-cra',
    sourcePath: 'module-eu-cra',
    // Mirrors bench-main.ts: module-eu-cra imports the secdeva module and the
    // `secdeva/templates/project` template is the proven-working configuration
    // for this source tree. The `local/` prefix is rejected by the validator
    // (only imported module prefixes are allowed) and there are no
    // `eucra/cardTypes/*` types in the source.
    template: 'secdeva/templates/project',
    cardTypes: {
      leafTask: 'base/cardTypes/annualTask',
      phase: 'secdeva/cardTypes/page',
      riskTask: 'base/cardTypes/quarterlyTask',
      projectRoot: 'secdeva/cardTypes/project',
    },
  },
];

// ── Query slot configuration ────────────────────────────────────────────────
// Each card-query target (`card-leaf-task`, `card-phase`, ...) maps to one of
// the cardType slots above.
const QUERY_SLOTS = [
  { query: 'card-leaf-task', slot: 'leafTask' },
  { query: 'card-phase', slot: 'phase' },
  { query: 'card-risk', slot: 'riskTask' },
  { query: 'card-root', slot: 'projectRoot' },
] as const satisfies ReadonlyArray<{
  query: string;
  slot: keyof ProjectConfig['cardTypes'];
}>;

// ── gringo helper ───────────────────────────────────────────────────────────
/**
 * Pre-grounds `baseProgram` and writes the ASPIF text to `destFile`. The
 * gringo invocation itself lives in `gringo.ts`, shared with
 * `binary-baseline.ts`.
 */
async function buildAspifBase(
  baseProgram: string,
  destFile: string,
): Promise<void> {
  const aspif = await groundToAspif(baseProgram);
  await writeFile(destFile, aspif);
}

// ── Git SHA (best-effort, for meta.json) ────────────────────────────────────
async function getGitSha(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: dirname(fileURLToPath(import.meta.url)),
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

// ── Generator core ──────────────────────────────────────────────────────────
export interface GenerateOptions {
  /** Absolute path to the shared fixtures root. */
  outputDir: string;
  /**
   * Optional list of project names (matching `PROJECTS[].name`) to limit
   * generation. Default: all configured projects.
   */
  projects?: string[];
  scaleMin: number;
  scaleMax: number;
  scaleStep: number;
  /** Optional override of the repo root. Defaults to `<this-file>/../../..`. */
  repoRoot?: string;
  /**
   * If true, use the fast scaling path (`fastScaleProject`) which skips
   * `handleNewCards` for replicated instances. Safe only for projects whose
   * `onTransitionSetField` / `onTransitionExecuteTransition` rules don't fire
   * on creation; see README-gen-fixtures.md.
   */
  fast?: boolean;
}

function repoRootDefault(): string {
  // src/generate-fixtures.ts → tools/benchmarks/src → repo root
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
}

function progress(msg: string) {
  console.error(`[gen-fixtures] ${msg}`);
}

/**
 * Generates fixtures for all selected projects across the requested scale range.
 */
export async function generateFixtures(
  options: GenerateOptions,
): Promise<void> {
  const repoRoot = options.repoRoot ?? repoRootDefault();
  const selected = options.projects
    ? PROJECTS.filter((p) => options.projects!.includes(p.name))
    : PROJECTS;

  if (selected.length === 0) {
    throw new Error(
      `No matching projects. Configured: ${PROJECTS.map((p) => p.name).join(', ')}`,
    );
  }

  await mkdir(options.outputDir, { recursive: true });
  const bf = await loadBaselineFiles();
  const gitSha = await getGitSha();

  for (const project of selected) {
    progress(`project: ${project.name}`);
    const sourcePath = resolve(repoRoot, project.sourcePath);

    for (
      let scale = options.scaleMin;
      scale <= options.scaleMax;
      scale += options.scaleStep
    ) {
      await generateOne({
        project,
        scale,
        sourcePath,
        outputDir: options.outputDir,
        baseline: bf,
        gitSha,
        fast: options.fast ?? false,
      });
    }
  }
}

interface GenerateOneArgs {
  project: ProjectConfig;
  scale: number;
  sourcePath: string;
  outputDir: string;
  baseline: BaselineFiles;
  gitSha: string | null;
  fast: boolean;
}

async function generateOne(args: GenerateOneArgs): Promise<void> {
  const { project, scale, sourcePath, outputDir, baseline, gitSha, fast } =
    args;
  progress(
    `  scale ${scale}: scaling source project${fast ? ' (fast path)' : ''}`,
  );

  // Protect each cardType the bench needs to query so trimToTarget doesn't
  // delete the last representative when scaling below the seed-instance size.
  const protectedCardTypes = new Set<string>(
    Object.values(project.cardTypes).filter(
      (t): t is string => typeof t === 'string' && t.length > 0,
    ),
  );
  const scaledTmp = fast
    ? await fastScaleProject(
        sourcePath,
        scale,
        project.template,
        protectedCardTypes,
      )
    : await scaleProject(sourcePath, scale, project.template);
  let commands: Awaited<ReturnType<typeof CommandManager.getInstance>> | null =
    null;

  try {
    commands = await CommandManager.getInstance(scaledTmp);
    const ctx = commands.project.calculationEngine.context;

    // Find target cards per configured slot.
    progress(`  scale ${scale}: locating target cards`);
    const allCards = commands.project.cards(undefined, {
      metadata: true,
      content: true,
    });

    const slotCards: Partial<
      Record<keyof ProjectConfig['cardTypes'], { key: string; content: string }>
    > = {};
    for (const slot of [
      'leafTask',
      'phase',
      'riskTask',
      'projectRoot',
    ] as const) {
      const cardType = project.cardTypes[slot];
      if (!cardType) continue;
      const found = allCards.find((c) => c.metadata?.cardType === cardType);
      if (!found) {
        throw new Error(
          `Project '${project.name}' at scale ${scale}: could not find a card with type '${cardType}' (slot '${slot}'). Trim should have preserved one — verify protectedCardTypes is wired through.`,
        );
      }
      slotCards[slot] = { key: found.key, content: found.content ?? '' };
    }

    // Compile queries that we'll persist.
    const compiledQueries: Record<string, string> = {
      tree: Handlebars.compile(lpFiles.queries.tree)({}),
    };
    for (const { query, slot } of QUERY_SLOTS) {
      const card = slotCards[slot];
      if (!card) continue;
      compiledQueries[query] = Handlebars.compile(lpFiles.queries.card)({
        cardKey: card.key,
      });
    }

    const fixtureRoot = join(outputDir, project.name, String(scale));
    await mkdir(join(fixtureRoot, 'programs', 'baseline'), { recursive: true });
    await mkdir(join(fixtureRoot, 'programs', 'baseline+resultfield'), {
      recursive: true,
    });

    // ── baseline (pre-resultField QL) ──────────────────────────────────────
    progress(`  scale ${scale}: building baseline programs`);
    swapToOldQL(ctx, baseline);
    try {
      // Tree query with old QL
      {
        const program = ctx.buildProgram(compiledQueries.tree, ['all']);
        await writeFile(
          join(fixtureRoot, 'programs', 'baseline', 'tree.lp'),
          program,
        );
      }
      // Per-card queries with old QL — old card.lp template, not the current.
      for (const { query, slot } of QUERY_SLOTS) {
        const card = slotCards[slot];
        if (!card) continue;
        const oldCardQuery = Handlebars.compile(baseline.card)({
          cardKey: card.key,
        });
        const program = ctx.buildProgram(oldCardQuery, ['all']);
        await writeFile(
          join(fixtureRoot, 'programs', 'baseline', `${query}.lp`),
          program,
        );
      }
    } finally {
      restoreCurrentQL(ctx);
    }

    // ── baseline+resultfield (current QL) ──────────────────────────────────
    progress(`  scale ${scale}: building baseline+resultfield programs`);
    {
      // Tree
      const program = ctx.buildProgram(compiledQueries.tree, ['all']);
      await writeFile(
        join(fixtureRoot, 'programs', 'baseline+resultfield', 'tree.lp'),
        program,
      );
    }
    for (const { query, slot } of QUERY_SLOTS) {
      const card = slotCards[slot];
      if (!card) continue;
      const program = ctx.buildProgram(compiledQueries[query], ['all']);
      await writeFile(
        join(fixtureRoot, 'programs', 'baseline+resultfield', `${query}.lp`),
        program,
      );
    }

    // ── incremental base (gringo-prebuilt ASPIF) ───────────────────────────
    progress(`  scale ${scale}: pre-grounding incremental base via gringo`);
    ctx.removeProgram('queryLanguage');
    ctx.removeProgram('utils');
    let baseProgram: string;
    try {
      baseProgram = ctx.buildProgram('', ['all']);
    } finally {
      restoreCurrentQL(ctx);
    }
    await buildAspifBase(
      baseProgram,
      join(fixtureRoot, 'programs', 'incremental-base.aspif'),
    );

    // ── Persist sidecars ───────────────────────────────────────────────────
    progress(`  scale ${scale}: writing sidecar JSON`);
    const cardsJson: Record<string, string> = {};
    if (slotCards.leafTask) cardsJson.leafKey = slotCards.leafTask.key;
    if (slotCards.phase) cardsJson.phaseKey = slotCards.phase.key;
    if (slotCards.riskTask) {
      cardsJson.riskKey = slotCards.riskTask.key;
      cardsJson.riskContent = slotCards.riskTask.content;
    }
    if (slotCards.projectRoot) cardsJson.rootKey = slotCards.projectRoot.key;

    await writeFile(
      join(fixtureRoot, 'cards.json'),
      JSON.stringify(cardsJson, null, 2),
    );
    await writeFile(
      join(fixtureRoot, 'queries.json'),
      JSON.stringify(compiledQueries, null, 2),
    );
    const cardCount = commands.project.cards().length;
    const meta = {
      project: project.name,
      scale,
      template: project.template,
      cardCount,
      generatedAt: new Date().toISOString(),
      gitSha,
    };
    await writeFile(
      join(fixtureRoot, 'meta.json'),
      JSON.stringify(meta, null, 2),
    );

    // ── Copy scaled project tree (must be self-contained) ──────────────────
    progress(`  scale ${scale}: copying project tree (cardCount=${cardCount})`);
    // Dispose the current CommandManager before copying so file watchers /
    // logs don't race with the cp.
    commands.project.dispose();
    commands = null;
    await cp(scaledTmp, join(fixtureRoot, 'project'), {
      recursive: true,
      // Don't follow symlinks; preserve them as-is for portability.
      verbatimSymlinks: true,
    });

    progress(`  scale ${scale}: done`);
  } finally {
    if (commands) {
      try {
        commands.project.dispose();
      } catch {
        // ignore
      }
    }
    await cleanupScaledProject(scaledTmp);
  }
}

// ── CLI ────────────────────────────────────────────────────────────────────
interface CliArgs {
  outputDir: string;
  projects: string[] | undefined;
  scaleMin: number;
  scaleMax: number;
  scaleStep: number;
  fast: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  if (argv.length === 0) {
    usage();
    process.exit(1);
  }

  let outputDir: string | null = null;
  const projects: string[] = [];
  let scaleMin = 1000;
  let scaleMax = 50_000;
  let scaleStep = 1000;
  let fast = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project') {
      const value = argv[++i];
      if (!value) throw new Error('--project requires a value');
      projects.push(value);
    } else if (arg === '--scale-min') {
      scaleMin = parseScale(argv[++i], '--scale-min');
    } else if (arg === '--scale-max') {
      scaleMax = parseScale(argv[++i], '--scale-max');
    } else if (arg === '--scale-step') {
      scaleStep = parseScale(argv[++i], '--scale-step');
    } else if (arg === '--fast') {
      fast = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!outputDir) {
      outputDir = arg;
    } else {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }

  if (!outputDir) {
    throw new Error('output-dir is required');
  }
  if (scaleMin <= 0 || scaleMax <= 0 || scaleStep <= 0) {
    throw new Error('scale values must be positive');
  }
  if (scaleMax < scaleMin) {
    throw new Error('--scale-max must be >= --scale-min');
  }

  return {
    outputDir: resolve(outputDir),
    projects: projects.length > 0 ? projects : undefined,
    scaleMin,
    scaleMax,
    scaleStep,
    fast,
  };
}

function parseScale(raw: string | undefined, flag: string): number {
  if (raw === undefined) throw new Error(`${flag} requires a value`);
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${flag} must be an integer; got ${raw}`);
  }
  return n;
}

function usage() {
  console.error(
    'Usage: tsx src/generate-fixtures.ts <output-dir> [--project <name>] [--scale-min 1000] [--scale-max 50000] [--scale-step 1000] [--fast]',
  );
  console.error(
    '  --project may be passed multiple times to limit generation.',
  );
  console.error(
    `  Configured projects: ${PROJECTS.map((p) => p.name).join(', ')}`,
  );
  console.error(
    '  --fast  Use the fast scaling path (skips per-card createCard / handleNewCards.',
  );
  console.error(
    '          Only safe when no on-creation transition rules fire — see',
  );
  console.error('          tools/benchmarks/scripts/README-gen-fixtures.md.');
}

// Only run main() when invoked as a script.
const invokedAsScript =
  fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');

if (invokedAsScript) {
  const args = parseArgs(process.argv.slice(2));
  generateFixtures(args).catch((error) => {
    console.error('Fixture generation failed:', error);
    process.exit(1);
  });
}
